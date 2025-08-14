const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('countdown')
        .setDescription('Start a countdown with audio in the voice channel')
        .addIntegerOption(option =>
            option.setName('number')
                .setDescription('Number to countdown from (5-60)')
                .setRequired(true)
                .setMinValue(5)
                .setMaxValue(60)
        ),
    
    async execute(interaction) {
        const countdownNumber = interaction.options.getInteger('number');
        
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

        await interaction.reply(`Starting countdown from ${countdownNumber}! 🎯`);

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

            // Path to the single countdown file
            const audioPath = path.join(__dirname, '..', 'countdown_audio', 'countdown.mp4');
            
            // Check if audio file exists
            if (!fs.existsSync(audioPath)) {
                return await interaction.followUp({
                    content: 'Countdown audio file not found!',
                    ephemeral: true
                });
            }

            // Calculate starting position in the audio file
            // Assuming the audio counts from 60 to 1, and each number takes ~1 second
            // So to start from number X, we need to skip (60 - X) seconds
            const startTime = 60 - countdownNumber;
            
            // Create audio resource with FFmpeg seeking for more reliable seeking
            const resource = createAudioResource(audioPath, {
                inputType: 'arbitrary',
                encoderArgs: ['-ss', startTime.toString()],
                metadata: { title: `Countdown from ${countdownNumber}` }
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
