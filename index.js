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
 * Helpers
 */
function hashUserId(userId) {
  return crypto.createHash("sha256").update(userId).digest("hex");
}

function shortConfessionId(uuid) {
  return `C-${uuid.split("-")[0].toUpperCase()}`;
}

function anonId(userHash) {
  return `A-${userHash.slice(0, 6).toUpperCase()}`;
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
 * SLASH COMMAND + BUTTON HANDLER
 * ================================
 */
client.on(Events.InteractionCreate, async (interaction) => {
  // Slash command
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

  // Button selection
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

    const serverConfig = await getServerConfig(selectedServer.id);
    const channel = await client.channels.fetch(
      serverConfig.confessionChannelId
    );

    const confessionUuid = crypto.randomUUID();
    const confessionShort = shortConfessionId(confessionUuid);
    const anon = anonId(hashedUserId);

    const embed = new EmbedBuilder()
      .setTitle("💬 Anonymous Confession")
      .setDescription(pending.message)
      .setColor(0xff66cc)
      .setTimestamp()
      .setFooter({
        text: `Confession ID: ${confessionShort} | Anon ID: ${anon}`
      });

    if (pending.media?.length > 0) {
      embed.setImage(pending.media[0].url);
    }

    await channel.send({ embeds: [embed] });

    await saveConfession({
      serverId: selectedServer.id,
      channelId: channel.id,
      confessionUuid,
      confessionShortId: confessionShort,
      message: pending.message,
      userHash: hashedUserId
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

  // Extract image / GIF
  const media = [];
  for (const attachment of message.attachments.values()) {
    if (attachment.contentType?.startsWith("image/")) {
      media.push({ url: attachment.url });
    }
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

  if (eligibleServers.length === 1) {
    const server = eligibleServers[0];
    const serverConfig = await getServerConfig(server.id);
    const channel = await client.channels.fetch(
      serverConfig.confessionChannelId
    );

    const confessionUuid = crypto.randomUUID();
    const confessionShort = shortConfessionId(confessionUuid);
    const anon = anonId(hashedUserId);

    const embed = new EmbedBuilder()
      .setTitle("💬 Anonymous Confession")
      .setDescription(confessionText)
      .setColor(0xff66cc)
      .setTimestamp()
      .setFooter({
        text: `Confession ID: ${confessionShort} | Anon ID: ${anon}`
      });

    if (media.length > 0) {
      embed.setImage(media[0].url);
    }

    await channel.send({ embeds: [embed] });

    await saveConfession({
      serverId: server.id,
      channelId: channel.id,
      confessionUuid,
      confessionShortId: confessionShort,
      message: confessionText,
      userHash: hashedUserId
    });

    await message.reply("✅ Your confession was posted anonymously.");
    return;
  }

  await savePendingConfession({
    hashedUserId,
    message: confessionText,
    servers: eligibleServers,
    media
  });

  const buttons = eligibleServers.map((s) =>
    new ButtonBuilder()
      .setCustomId(`CONFESS_SERVER_${s.id}`)
      .setLabel(s.name)
      .setStyle(ButtonStyle.Primary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  await message.reply({
    content: "Which server is this confession for?",
    components: rows
  });
});

client.login(config.discordToken);