require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SALONS_AUTORISES = process.env.SALONS_AUTORISES
  ? process.env.SALONS_AUTORISES.split(',').map(s => s.trim())
  : [];
const MEMOIRE_PAR_USER = 15;
const SALON_STAFF = '1394658017781354549';

// === SALONS INFOS ===
const salonsInfos = [
  { nom: 'annonce', id: '1394657978904481842' },
  { nom: 'reglement', id: '1394657980204716184' },
  { nom: 'mises à jour', id: '1394657981735505932' },
  { nom: 'bienvenue', id: '1394657985749323787' },
  { nom: 'general', id: '1394657987628503102' },
  { nom: 'media', id: '1394657989616734269' },
  { nom: 'presentation', id: '1394657990887608361' },
  { nom: 'suggestion', id: '1395151190777663548' },
  { nom: 'top invite', id: '1394657996117901332' },
  { nom: 'notif live', id: '1394657997627850752' },
  { nom: 'lspd', id: '1394658001108992052' },
  { nom: 'ems', id: '1394658002497441812' },
  { nom: 'gouvernement', id: '1394658004061913088' },
  { nom: 'mecano', id: '1394658005156626502' },
  { nom: 'taxi', id: '1394658007203315885' },
  { nom: 'bug report', id: '1395150271830691950' },
  { nom: "besoin d'aide salon vocau", id: '1394658030628376719' },
  { nom: 'boutique vehicule', id: '1394658053378412545' },
  { nom: 'shop nxst coin', id: '1394658055949390016' },
  { nom: 'passer commande', id: '1394658057811792124' },
  { nom: 'ticket support', id: '1394658026119761950' }
];
const salonsNomVersLien = {};
salonsInfos.forEach(s => salonsNomVersLien[s.nom.toLowerCase()] = `<#${s.id}>`);

// === MEMOIRE UTILISATEUR (persistante) ===
const memoirePath = './memoire.json';
let memoire = {};
if (fs.existsSync(memoirePath)) {
  try { memoire = JSON.parse(fs.readFileSync(memoirePath)); } catch { memoire = {}; }
}
function saveMemoire() {
  fs.writeFileSync(memoirePath, JSON.stringify(memoire, null, 2));
}
function addMemoire(userId, content, channel) {
  if (!memoire[userId]) memoire[userId] = [];
  memoire[userId].push({ content, date: new Date(), channel });
  if (memoire[userId].length > MEMOIRE_PAR_USER) {
    memoire[userId] = memoire[userId].slice(-MEMOIRE_PAR_USER);
  }
  if (Object.keys(memoire).length > 500) {
    let users = Object.keys(memoire).slice(-200);
    let newMemoire = {};
    for (const id of users) newMemoire[id] = memoire[id];
    memoire = newMemoire;
  }
  saveMemoire();
}
function getMemoire(userId) {
  if (!memoire[userId]) return "";
  return memoire[userId].map(m => `[${m.channel}] ${m.content}`).join('\n');
}

// === LOG COLORE
function log(msg, type = 'info') {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const color =
    type === 'error' ? '\x1b[31m'
    : type === 'warn' ? '\x1b[33m'
    : type === 'alert' ? '\x1b[35m'
    : '\x1b[32m';
  const label = (type === 'alert') ? '[ALERTE]' : `[${type.toUpperCase()}]`;
  console.log(`${color}[${now}] ${label} ${msg}\x1b[0m`);
}

// === BLACKLIST, PHRASES POLITESSE, INSULTES ULTRA ÉTENDUES ===
const blacklist = [
  // Mets toutes tes variantes ici
  'salut','bonjour','coucou','wesh','re','yo','bienvenue','merci','gg','bonne nuit','bonne soirée',
  'a+','lol','mdr','ptdr','ok','yes','ouais','ça va','ça roule','à demain','bien ou quoi','force à vous',
  'bien joué','bonne chance','mdrr','ouais ouais','bien vu','yo tout le monde','bjr','bnj','slt','c bon','je suis là',
  'trkl','tranquille','au calme','yep','vas-y','vas y','dsl','désolé','svp','merci bcp','à toute','atout'
];
const phrasesPolitesse = [
  "ça va ?","ca va ?","comment ça va ?","comment ca va ?","comment sava ?","commet sava ?","comment allez-vous ?",
  "comment va tout le monde ?","sava ?","commet sava tous le monde ?","salut tout le monde ?",
  "bonjour tout le monde ?","salut ça va ?","bonjour ça va ?","yooo ?","yo ?","hello ?","re ?"
];
const insultes = [
  // + phonétique, leet, variations... (comme précédemment)
  "fdp","ntm","tg","ta gueule","connard","pute","bâtard","batard","enculé","encule","merde","salope","pd",
  "fils de pute","nique ta mère","nique ta mere","chienne","sous-merde","gros con","trou du cul","va crever",
  "sale","abruti","débile","couillon","enfoiré","grognasse","bite","salaud","salaope","foutre","bouffon",
  "clochard","tapette","branleur","mongol","mongole","ducon","bougnoule","nègre","nazi","pédé","enculer","nique",
  "zgeg","porc","enfoire","victime","rat","gouine","fiotte","merdeux","chieur","toxico","nazillon","triso",
  "nique ta race","nique ta reum","fils de chien","nique ta soeur","nique ta famille","nique ton père",
  "fuck","bitch","motherfucker","shit","asshole","cunt","dick","bastard","jerk","retard","dumbass","idiot",
  "faggot","moron","prick","whore","slut","sucker","son of a bitch","stupid","loser","cock","wanker",
  "puta","cabron","pendejo","coño","gilipollas","mierda","puto","putita","perra","joder","maricón",
  "nik","nyk","n1q","n1qu","n1que","niqu3","m3r3","put4","encul3","bat4rd","b4tard","pd","fils2pute","f1ls2pute","suce ma bite"
];

// === NORMALISATION ANTI-LEET/ACCENTS/SYMBOLES ===
function normalizeLeetSpeak(str) {
  return str
    .replace(/[1!|]/g, 'i')
    .replace(/[3€]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[5\$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[\(\[\{]/g, 'c')
    .replace(/[\)\]\}]/g, 'd')
    .replace(/[\?]/g, 'q')
    .replace(/[^a-z0-9 ]/gi, ' ') // tout le reste en espace
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève accents
    .toLowerCase();
}

// === DÉTECTION INSULTE & SIGNALEMENT/DOUBT ===
async function detectInsulteEtSignale(message, client) {
  const raw = message.content.toLowerCase();
  const normalized = normalizeLeetSpeak(raw);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  let suspect = false;

  for (const insult of insultes) {
    const normInsult = normalizeLeetSpeak(insult);

    // Mot exact ou très proche uniquement (>= 4 caractères)
    if (
      tokens.some(word =>
        word === normInsult ||
        (normInsult.length >= 5 && word.startsWith(normInsult.slice(0, 5)))
      )
    ) {
      suspect = true;
      break;
    }
  }

  if (suspect) {
    await message.delete().catch(() => {});
    const salonStaff = await client.channels.fetch(SALON_STAFF);
    await salonStaff.send({
      content: `🚨 **SIGNALEMENT INSULTE/SUSPECT** : ${message.author} dans <#${message.channel.id}>\n> Message (normalisé):\n\`${raw}\`\n\`→ ${normalized}\``,
    });
    try { await message.author.send("Tu viens d'être signalé au staff NXST RP pour propos inappropriés/interdits ou suspects."); } catch {}
    log(`Signalement (suspect ou insultes) pour ${message.author.tag} : "${raw}"`, 'alert');
    return true;
  }
  return false;
}



// === DÉTECTION QUESTION/BESOIN (ULTRA STRICT) ===
function isQuestionOrNeed(message) {
  const content = message.content.toLowerCase().trim();
  if (phrasesPolitesse.some(p => content === p || content.startsWith(p))) return false;
  if (blacklist.includes(content) || content.length < 16) return false;
  const triggerPatterns = [
    /\b(comment|pourquoi|peux[- ]tu|peut[- ]on|possible|où|quelle|quand|aide|info|besoin|aidez[- ]moi|help|rp|gta|bug|ticket|demande|cherche|trouve|probl[èe]me|résolution|marche pas|j'ai un souci|qui peut|je veux|je n'arrive pas|comment faire|boutique|livraison|commande|job|rôle|reglement|règlement|event|évènement|événement|changer|modifier|créer|ouvrir|supprimer|join|joiner|quitter|role|serveur|discord|permission|accès|ban|kick|mute|punition|infractions|reset|réinitialiser|faq|question|commande|guide|infos|info|documentation)\b/
  ];
  const triggerScore = triggerPatterns.reduce((score, reg) => reg.test(content) ? score + 1 : score, 0);
  const words = content.split(' ').filter(w => !blacklist.includes(w) && w.length > 2);
  if (triggerScore < 1 || words.length < 3) return false;
  return true;
}

// === NETTOYAGE SALUTATION POUR IA ===
function removeGreeting(content) {
  let text = content.trim();
  for (const greet of blacklist) {
    if (text.startsWith(greet + " ")) {
      text = text.slice(greet.length).trim();
      break;
    }
  }
  return text;
}

// === PROMPT IA (évolutif, RP, structuré) ===
function promptNXST(question, userTag, contexte, salonsList) {
  const salonsDispo = salonsList
    .map(s => `- ${s.nom} : <#${s.id}>`)
    .join('\n');
  return `
Tu es NXSTxAI, l'intelligence artificielle officielle du serveur Discord NXST RP (FiveM GTA 5).
Réponds uniquement aux questions ou besoins réels sur le RP GTA 5, le serveur NXST, la boutique, le staff, les salons, bugs, jobs, ou la vie IG. Jamais de hors-sujet, jamais de débat, jamais de politesse seule.
Si la demande est imprécise, propose d'être plus clair ("Peux-tu préciser ta question ou ton problème sur NXST ?").
Si tu ne sais pas, propose d'ouvrir un ticket ou de contacter le staff. Réponds toujours en 1-2 phrases max, ton RP, amical mais ferme.
Si on demande un salon, donne le lien direct.

Infos serveur :
${salonsDispo}

Historique récent utilisateur :
${contexte}

Question/utilisateur :
${question}
`.trim();
}

// === APPEL GEMINI (avec log) ===
let derniereReqIA = 0;
async function askGemini(question, userTag, contexte = "") {
  const now = Date.now();
  if (now - derniereReqIA < 1100) {
    log('Anti-spam IA déclenché, attente 1s...', 'warn');
    await new Promise(res => setTimeout(res, 1100));
  }
  derniereReqIA = Date.now();

  const prompt = promptNXST(question, userTag, contexte, salonsInfos);
  log(`Prompt envoyé à Gemini :\n${prompt}\n`, 'info');

  try {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_API_KEY,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      },
      { headers: { "Content-Type": "application/json" } }
    );
    const result = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    log(`Réponse Gemini :\n${result}`, 'info');
    return result || "Je ne parle que du RP GTA 5 sur NXST !";
  } catch (e) {
    log(`Erreur Gemini :\n${JSON.stringify(e?.response?.data)}`, 'error');
    return "Oups, je ne peux pas répondre pour l’instant. Réessaie plus tard !";
  }
}

// === DISCORD BOT PRINCIPAL ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  // --- INSULTE OU SUSPICION : SUPPRIME + SIGNALE STAFF ---
  if (await detectInsulteEtSignale(message, client)) return;

  if (!SALONS_AUTORISES.includes(message.channel.id)) return;
  if (!isQuestionOrNeed(message)) return;

  addMemoire(message.author.id, message.content, message.channel.name);

  // Shortcut salons
  let specialReply = null;
  for (const nom in salonsNomVersLien) {
    if (message.content.toLowerCase().includes(nom)) {
      specialReply = `Le salon **${nom}** est ici : ${salonsNomVersLien[nom]}`;
      break;
    }
  }

  const questionClean = removeGreeting(message.content);
  const contexte = getMemoire(message.author.id);

  let reply;
  if (specialReply) {
    reply = specialReply;
  } else {
    reply = await askGemini(questionClean, message.author.tag, contexte);
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setAuthor({ name: "🤖 NXSTxAI", iconURL: client.user.displayAvatarURL() })
    .setDescription(reply)
    .setFooter({ text: `NXST RP - Assistant IA GTA 5`, iconURL: message.guild.iconURL() });

  await message.reply({ embeds: [embed] });
  log(`Réponse envoyée à ${message.author.tag} dans #${message.channel.name}`, 'info');
});

client.once('ready', () => {
  log(`✅ NXSTxAI connecté en tant que ${client.user.tag}`, 'info');
});

client.login(TOKEN);
