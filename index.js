import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  Events
} from "discord.js";
import crypto from "crypto";
import { config } from "./config.js";
import {
  saveServerConfig,
  getServerConfig,
  saveConfession,
  savePendingConfession,
  getPendingConfession,
  deletePendingConfession
} from "./dynamo.js";

/**
 * Hash user ID (privacy-safe)
 */
function hashUserId(userId) {
  return crypto.createHash("sha256").update(userId).digest("hex");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

/**
 * ================================
 * SLASH COMMAND HANDLER
 * ================================
 */
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setconfession") {
    if (
      !interaction.memberPermissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      await interaction.reply({
        content: "❌ Admin permission required.",
        ephemeral: true
      });
      return;
    }

    await saveServerConfig(interaction.guildId, interaction.channelId);

    await interaction.reply({
      content: `✅ Confession channel set to <#${interaction.channelId}>`,
      ephemeral: true
    });
  }
});

/**
 * ================================
 * DM CONFESSION FLOW (UNCHANGED)
 * ================================
 */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild) return;

  const hashedUserId = hashUserId(message.author.id);

  // STEP 2 — User selects server
  const pending = await getPendingConfession(hashedUserId);
  if (pending) {
    const choice = parseInt(message.content, 10);
    if (isNaN(choice) || choice < 1 || choice > pending.servers.length) {
      await message.reply("❌ Invalid selection.");
      return;
    }

    const selectedServer = pending.servers[choice - 1];
    const serverConfig = await getServerConfig(selectedServer.id);
    const channel = await client.channels.fetch(
      serverConfig.confessionChannelId
    );

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("💬 Anonymous Confession")
          .setDescription(pending.message)
          .setColor(0xff66cc)
          .setTimestamp()
      ]
    });

    await saveConfession({
      serverId: selectedServer.id,
      channelId: channel.id,
      confessionId: crypto.randomUUID(),
      message: pending.message
    });

    await deletePendingConfession(hashedUserId);
    await message.reply("✅ Your confession was posted anonymously.");
    return;
  }

  // STEP 1 — New confession
  if (!message.content.toLowerCase().startsWith("confess:")) {
    await message.reply("Use format:\n`confess: your message here`");
    return;
  }

  const confessionText = message.content.substring(8).trim();
  if (!confessionText) {
    await message.reply("Confession cannot be empty.");
    return;
  }

  const eligibleServers = [];

  for (const guild of client.guilds.cache.values()) {
    const member = await guild.members
      .fetch(message.author.id)
      .catch(() => null);

    if (!member) continue;

    const cfg = await getServerConfig(guild.id);
    if (!cfg) continue;

    eligibleServers.push({
      id: guild.id,
      name: guild.name
    });
  }

  if (eligibleServers.length === 0) {
    await message.reply("❌ No server has confessions enabled.");
    return;
  }

  if (eligibleServers.length === 1) {
    const server = eligibleServers[0];
    const serverConfig = await getServerConfig(server.id);
    const channel = await client.channels.fetch(
      serverConfig.confessionChannelId
    );

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("💬 Anonymous Confession")
          .setDescription(confessionText)
          .setColor(0xff66cc)
          .setTimestamp()
      ]
    });

    await saveConfession({
      serverId: server.id,
      channelId: channel.id,
      confessionId: crypto.randomUUID(),
      message: confessionText
    });

    await message.reply("✅ Your confession was posted anonymously.");
    return;
  }

  await savePendingConfession({
    hashedUserId,
    message: confessionText,
    servers: eligibleServers
  });

  const serverList = eligibleServers
    .map((s, i) => `${i + 1}️⃣ ${s.name}`)
    .join("\n");

  await message.reply(
    `Which server is this confession for?\n\n${serverList}\n\nReply with the number (expires in 5 minutes).`
  );
});

client.login(config.discordToken);