const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('countdown')
        .setDescription('Start a countdown with audio in the voice channel')
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Select countdown duration')
                .setRequired(true)
                .addChoices(
                    { name: '10 seconds', value: '10' },
                    { name: '20 seconds', value: '20' },
                    { name: '30 seconds', value: '30' },
                    { name: '40 seconds', value: '40' },
                    { name: '50 seconds', value: '50' },
                    { name: '60 seconds', value: '60' }
                )
        ),
    
    async execute(interaction) {
        const countdownDuration = interaction.options.getString('duration');
        
        // Check if user is in a voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return await interaction.reply({
                content: 'You need to be in a voice channel to use this command!',
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

        await interaction.reply(`Starting ${countdownDuration} second countdown! 🎯`);

        try {
            // Check for existing voice connection first
            let connection = getVoiceConnection(interaction.guild.id);
            
            if (!connection) {
                // No existing connection, create a new one
                connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator,
                });

                // Store connection reference
                if (!interaction.client.voiceConnections) {
                    interaction.client.voiceConnections = new Map();
                }
                interaction.client.voiceConnections.set(interaction.guild.id, connection);
            }

            // Create audio player with improved settings
            const player = createAudioPlayer({
                behaviors: {
                    noSubscriber: 'pause',
                    maxMissedFrames: Math.round(5000 / 20) // 5 seconds of missed frames
                }
            });
            connection.subscribe(player);

            // Path to the specific countdown file
            const audioPath = path.join(__dirname, '..', 'countdown_audio', `countdown${countdownDuration}.mp4`);
            
            // Check if audio file exists
            if (!fs.existsSync(audioPath)) {
                return await interaction.followUp({
                    content: `Countdown${countdownDuration}.mp4 audio file not found!`,
                    ephemeral: true
                });
            }

            // Create audio resource - no seeking needed since each file is complete
            const resource = createAudioResource(audioPath, {
                inputType: 'arbitrary',
                inlineVolume: true,
                metadata: { title: `${countdownDuration} second countdown` }
            });

            // Add error handling for the player
            player.on('error', (error) => {
                console.error('Audio player error:', error);
            });

            // Add a small delay before playing to ensure connection is stable
            setTimeout(() => {
                player.play(resource);
            }, 300);

            // Handle when audio finishes
            player.once(AudioPlayerStatus.Idle, () => {
                // Don't automatically disconnect - let user use /leave command
                console.log('Countdown finished');
            });

            // Handle connection errors
            connection.on('error', console.error);

        } catch (error) {
            console.error('Error in countdown command:', error);
            await interaction.followUp({
                content: 'There was an error starting the countdown!',
                ephemeral: true
            });
        }
    },
};
