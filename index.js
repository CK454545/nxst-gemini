require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const axios = require('axios');

// === ENV ET CONFIG ===
const TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SALONS_AUTORISES = process.env.SALONS_AUTORISES
  ? process.env.SALONS_AUTORISES.split(',').map(s => s.trim())
  : [];
const MEMOIRE_PAR_USER = 15;

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

// === MÉMOIRE UTILISATEUR ===
const memoire = {};
function addMemoire(userId, content, channel) {
  if (!memoire[userId]) memoire[userId] = [];
  memoire[userId].push({ content, date: new Date(), channel });
  if (memoire[userId].length > MEMOIRE_PAR_USER) {
    memoire[userId] = memoire[userId].slice(-MEMOIRE_PAR_USER);
  }
}
function getMemoire(userId) {
  if (!memoire[userId]) return "";
  return memoire[userId].map(m => `[${m.channel}] ${m.content}`).join('\n');
}

// === FILTRE ULTRA-INTELLIGENT (pas de spam sur bavardage) ===
function isQuestionOrNeed(message) {
  const content = message.content.toLowerCase().trim();

  // Trop court ou vide
  if (content.length < 12) return false;

  // Blacklist ultra large
  const blacklist = [
    'salut', 'bonjour', 'coucou', 'wesh', 're', 'yo', 'bienvenue', 'merci', 'gg', 'bonne nuit', 'bonne soirée',
    'a+', 'lol', 'mdr', 'ptdr', 'ok', 'yes', 'ouais', 'ça va', 'ça roule', 'à demain', 'bien ou quoi', 'force à vous',
    'bien joué', 'bonne chance', 'mdrr', 'ouais ouais', 'bien vu', 'yo tout le monde', 'bjr', 'bnj', 'slt', 'c bon', 'je suis là'
  ];
  if (blacklist.some(w =>
    content === w ||
    content.startsWith(w + ' ') ||
    content.endsWith(' ' + w) ||
    content.includes(' ' + w + ' ')
  )) return false;

  // Recherche de besoin/question avec pattern smart
  const triggerPatterns = [
    /\?/, // point d'interrogation
    /\b(comment|pourquoi|peux[- ]tu|peut[- ]on|possible|où|quelle|quand|aide|info|besoin|aidez[- ]moi|help|rp|gta|bug|ticket|demande|cherche|trouve|probl[èe]me|résolution|marche pas|j'ai un souci|qui peut|je veux|je n'arrive pas|comment faire)\b/
  ];
  const isTrigger = triggerPatterns.some(reg => reg.test(content));
  if (!isTrigger) return false;

  // Ignore s'il y a trop peu de mots
  if (content.split(' ').length < 3) return false;

  return true;
}

// === PROMPT IA NXST (ultra strict, court, jamais HS) ===
function promptNXST(question, userTag, contexte, salonsList) {
  const salonsDispo = salonsList
    .map(s => `- ${s.nom} : <#${s.id}>`)
    .join('\n');
  return `
Tu es NXST Assistant IA, le chatbot officiel de la communauté NXST RP sur Discord (serveur GTA 5 FiveM). 
Tu aides uniquement sur le RP GTA 5, la vie NXST, les salons, métiers, jobs, tickets, bugs, events et règlements.
Ne répond jamais sur autre chose que NXST/GTA 5 RP et n'interviens jamais dans les discussions entre membres.

**Salons importants :**
${salonsDispo}

**Règles strictes :**
- Réponds en 1 à 2 phrases maximum, ton RP GTA 5, amical, jamais hors-sujet, jamais de débat ou blague.
- Si la question sort du RP NXST : "Je ne parle que du RP GTA 5 sur NXST !"
- Si on te demande un salon, fournis le lien direct même si mal orthographié.
- Si tu ne sais pas, propose d’ouvrir un ticket ou d’attendre un staff.

**Contexte utilisateur :**
${contexte}

**Question de ${userTag} :**
${question}
`.trim();
}

// === APPEL GEMINI (ou autre IA) ===
async function askGemini(question, userTag, contexte = "") {
  const prompt = promptNXST(question, userTag, contexte, salonsInfos);

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
    return result || "Je ne parle que du RP GTA 5 sur NXST !";
  } catch (e) {
    console.error(e);
    return "Oups, je ne peux pas répondre pour l’instant. Réessaie plus tard !";
  }
}

// === INITIALISATION DU BOT ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// === EVENT PRINCIPAL : messageCreate ultra filtré ===
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!SALONS_AUTORISES.includes(message.channel.id)) return;

  // Filtres stricts : uniquement question/besoin
  if (!isQuestionOrNeed(message)) return;

  addMemoire(message.author.id, message.content, message.channel.name);

  // Réponse "shortcut" pour demande salon
  let specialReply = null;
  for (const nom in salonsNomVersLien) {
    if (message.content.toLowerCase().includes(nom)) {
      specialReply = `Le salon **${nom}** est ici : ${salonsNomVersLien[nom]}`;
      break;
    }
  }

  const contexte = getMemoire(message.author.id);

  let reply;
  if (specialReply) {
    reply = specialReply;
  } else {
    reply = await askGemini(message.content, message.author.tag, contexte);
  }

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setAuthor({ name: "🤖 NXST Assistant IA", iconURL: client.user.displayAvatarURL() })
    .setDescription(reply)
    .setFooter({ text: `NXST RP - Assistant IA GTA 5`, iconURL: message.guild.iconURL() });

  await message.reply({ embeds: [embed] });
});

client.once('ready', () => {
  console.log(`✅ Bot NXST Assistant IA connecté en tant que ${client.user.tag}`);
});

client.login(TOKEN);
