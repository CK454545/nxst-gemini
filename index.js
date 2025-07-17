require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const axios = require('axios');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SALONS_AUTORISES = process.env.SALONS_AUTORISES
  ? process.env.SALONS_AUTORISES.split(',').map(s => s.trim())
  : [];

const MEMOIRE_PAR_USER = 15;
const memoire = {};

// Liste des salons et mapping ID/nom
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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Mémoire par user
function addMemoire(userId, content, channel) {
  if (!memoire[userId]) memoire[userId] = [];
  memoire[userId].push({ content, date: new Date(), channel });
  if (memoire[userId].length > MEMOIRE_PAR_USER) {
    memoire[userId] = memoire[userId].slice(-MEMOIRE_PAR_USER);
  }
}
function getMemoire(userId) {
  if (!memoire[userId]) return "";
  return memoire[userId].map(m => `Dans #${m.channel} : ${m.content}`).join('\n');
}

// Question ou besoin
function isQuestionOrNeed(message) {
  const triggers = [
    '?', 'comment', 'pourquoi', 'peux-tu', 'peut-on', 'possible', 'où', 'quelle', 'quand', 'aide', 'info', 'besoin', 'aidez-moi', 'help', 'rp', 'gta', 'bug', 'ticket', 'demande'
  ];
  const content = message.content.toLowerCase();
  return triggers.some(trigger => content.includes(trigger));
}

// Prompt ultra renseigné NXST
function promptNXST(question, userTag, contexte, salonsList) {
  // Génère la liste dynamique des salons avec leur lien
  const salonsDispo = salonsList
    .map(s => `- ${s.nom} : <#${s.id}>`)
    .join('\n');
  return `
Tu es NXST Assistant IA, le chatbot officiel de la communauté NXST RP sur Discord (serveur GTA 5 FiveM). 
Tu aides exclusivement sur le RP GTA 5, les métiers, le fonctionnement du serveur et les questions sur la vie IG NXST.
**Ne répond jamais sur autre chose que NXST, GTA 5 RP, ses règles, salons, staff, métiers, jobs, bug report ou events.**

**Salons importants :**
${salonsDispo}

**Règles strictes :**
- Réponses ultra courtes (1 à 2 phrases max), ton toujours RP GTA 5, amical, jamais robot.
- Jamais de hors-sujet, jamais de débat, jamais de blague déplacée.
- Si la question est HS, réponds "Je ne parle que du RP GTA 5 sur NXST !"
- Si on te demande un salon précis (même si c’est mal orthographié), fournis le lien direct.
- Si tu ne sais pas, propose d’ouvrir un ticket ou d’attendre un staff.

**Contexte utilisateur :**
${contexte}

**Question de ${userTag} :**
${question}
`.trim();
}

// Gestion Gemini
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

// Main event (filtre salons autorisés par ID)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!SALONS_AUTORISES.includes(message.channel.id)) return;

  addMemoire(message.author.id, message.content, message.channel.name);

  // Cherche si la question concerne un salon connu
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
