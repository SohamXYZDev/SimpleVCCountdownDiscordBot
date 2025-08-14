const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Leave the voice channel'),
    
    async execute(interaction) {
        try {
            // Get existing voice connection
            const connection = getVoiceConnection(interaction.guild.id);
            
            if (!connection) {
                return await interaction.reply({
                    content: "I'm not currently in a voice channel!",
                    ephemeral: true
                });
            }

            // Destroy the connection
            connection.destroy();

            // Remove from stored connections
            if (interaction.client.voiceConnections) {
                interaction.client.voiceConnections.delete(interaction.guild.id);
            }

            await interaction.reply('👋 Left the voice channel!');

        } catch (error) {
            console.error('Error leaving voice channel:', error);
            await interaction.reply({
                content: 'There was an error leaving the voice channel!',
                ephemeral: true
            });
        }
    },
};
