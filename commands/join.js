const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('join')
        .setDescription('Join your voice channel'),
    
    async execute(interaction) {
        // Check if user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await interaction.reply({
                content: 'You need to be in a voice channel for me to join!',
                ephemeral: true
            });
        }

        // Check bot permissions
        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
            return await interaction.reply({
                content: 'I need permission to connect and speak in your voice channel!',
                ephemeral: true
            });
        }

        try {
            // Join the voice channel
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            // Store connection reference for other commands to use
            if (!interaction.client.voiceConnections) {
                interaction.client.voiceConnections = new Map();
            }
            interaction.client.voiceConnections.set(interaction.guild.id, connection);

            // Handle connection errors
            connection.on('error', console.error);

            await interaction.reply(`✅ Joined **${voiceChannel.name}**!`);

        } catch (error) {
            console.error('Error joining voice channel:', error);
            await interaction.reply({
                content: 'There was an error joining the voice channel!',
                ephemeral: true
            });
        }
    },
};
