const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('muffin')
        .setDescription('Muffin bot commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('cd')
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
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join your voice channel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Leave the voice channel')
        ),
    
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'cd') {
            return await this.handleCountdown(interaction);
        } else if (subcommand === 'join') {
            return await this.handleJoin(interaction);
        } else if (subcommand === 'leave') {
            return await this.handleLeave(interaction);
        }
    },

    async handleCountdown(interaction) {
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
            let audioPath;
            if (countdownDuration === '60') {
                // For 60 seconds, use the main countdown.mp4 file
                audioPath = path.join(__dirname, '..', 'countdown_audio', 'countdown.mp4');
            } else {
                // For other durations, use countdown{duration}.mp4
                audioPath = path.join(__dirname, '..', 'countdown_audio', `countdown${countdownDuration}.mp4`);
            }
            
            // Check if audio file exists
            if (!fs.existsSync(audioPath)) {
                const fileName = countdownDuration === '60' ? 'countdown.mp4' : `countdown${countdownDuration}.mp4`;
                return await interaction.followUp({
                    content: `${fileName} audio file not found!`,
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

    async handleJoin(interaction) {
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

    async handleLeave(interaction) {
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
