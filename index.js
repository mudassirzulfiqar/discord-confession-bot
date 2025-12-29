import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
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
 * SLASH COMMAND
 * ================================
 */
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
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
    return;
  }

  /**
   * ================================
   * BUTTON HANDLER
   * ================================
   */
  if (interaction.isButton()) {
    const hashedUserId = hashUserId(interaction.user.id);
    const pending = await getPendingConfession(hashedUserId);

    if (!pending) {
      await interaction.reply({
        content: "❌ This confession request has expired.",
        ephemeral: true
      });
      return;
    }

    const serverId = interaction.customId.replace("CONFESS_SERVER_", "");
    const selectedServer = pending.servers.find(
      (s) => s.id === serverId
    );

    if (!selectedServer) {
      await interaction.reply({
        content: "❌ Invalid server selection.",
        ephemeral: true
      });
      return;
    }

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
      userHash: hashedUserId,
      message: pending.message
    });

    await deletePendingConfession(hashedUserId);

    await interaction.reply({
      content: "✅ Your confession was posted anonymously.",
      ephemeral: true
    });
  }
});

/**
 * ================================
 * DM CONFESSION FLOW
 * ================================
 */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.guild) return;

  const hashedUserId = hashUserId(message.author.id);

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

  // Single server → auto post
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
      userHash: hashedUserId,
      message: confessionText
    });

    await message.reply("✅ Your confession was posted anonymously.");
    return;
  }

  // Multiple servers → buttons
  await savePendingConfession({
    hashedUserId,
    message: confessionText,
    servers: eligibleServers
  });

  const buttons = eligibleServers.map((s) =>
    new ButtonBuilder()
      .setCustomId(`CONFESS_SERVER_${s.id}`)
      .setLabel(s.name)
      .setStyle(ButtonStyle.Primary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        buttons.slice(i, i + 5)
      )
    );
  }

  await message.reply({
    content: "Which server is this confession for?",
    components: rows
  });
});

client.login(config.discordToken);