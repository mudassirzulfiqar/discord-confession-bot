import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder
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

client.once("ready", () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  /**
   * ================================
   * ADMIN COMMAND (SERVER)
   * ================================
   */
  if (message.guild && message.content === "!setconfession") {
    if (
      !message.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      await message.reply("❌ Admin permission required.");
      return;
    }

    await saveServerConfig(message.guild.id, message.channel.id);

    await message.reply(
      `✅ Confession channel set to <#${message.channel.id}>`
    );
    return;
  }

  /**
   * ================================
   * DM FLOW
   * ================================
   */
  if (message.guild) return;

  const hashedUserId = hashUserId(message.author.id);

  /**
   * STEP 2 — User replies with a number
   */
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

  /**
   * STEP 1 — User sends confession
   */
  if (!message.content.toLowerCase().startsWith("confess:")) {
    await message.reply("Use format:\n`confess: your message here`");
    return;
  }

  const confessionText = message.content.substring(8).trim();
  if (!confessionText) {
    await message.reply("Confession cannot be empty.");
    return;
  }

  // Find eligible servers
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

  // Only one server → auto post
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

  // Multiple servers → ask user
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