import { REST, Routes, PermissionFlagsBits } from "discord.js";
import { config } from "./config.js";

const commands = [
  {
    name: "setconfession",
    description: "Set the confession channel for this server",
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
  }
];

const rest = new REST({ version: "10" }).setToken(config.discordToken);

(async () => {
  try {
    console.log("⏳ Registering slash commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("✅ Slash commands registered successfully");
  } catch (error) {
    console.error(error);
  }
})();