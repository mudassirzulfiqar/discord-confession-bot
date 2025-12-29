import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder
} from "discord.js";
import crypto from "crypto";
import {
  saveServerConfig,
  getServerConfig,
  saveConfession
} from "./dynamo.js";
import { config } from "./config.js";

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
   * ADMIN COMMAND (run inside server)
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
   * CONFESSION FLOW (DM only)
   */
  if (message.guild) return;

  if (!message.content.toLowerCase().startsWith("confess:")) {
    await message.reply(
      "Use format:\n`confess: your message here`"
    );
    return;
  }

  const confessionText = message.content.substring(8).trim();
  if (!confessionText) {
    await message.reply("Confession cannot be empty.");
    return;
  }

  try {
    const confessionId = crypto.randomUUID();

    // Find mutual server
    const guild = client.guilds.cache.find(g =>
      g.members.cache.has(message.author.id)
    );

    if (!guild) {
      await message.reply("❌ No mutual server found.");
      return;
    }

    const serverConfig = await getServerConfig(guild.id);
    if (!serverConfig) {
      await message.reply(
        "❌ Confession channel not set in this server."
      );
      return;
    }

    const channel = await client.channels.fetch(
      serverConfig.confessionChannelId
    );

    const embed = new EmbedBuilder()
      .setTitle("💬 Anonymous Confession")
      .setDescription(confessionText)
      .setColor(0xff66cc)
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    await saveConfession({
      serverId: guild.id,
      channelId: channel.id,
      confessionId,
      message: confessionText
    });

    await message.reply("✅ Your confession was posted anonymously.");
  } catch (err) {
    console.error(err);
    await message.reply("❌ Something went wrong.");
  }
});

client.login(config.discordToken);