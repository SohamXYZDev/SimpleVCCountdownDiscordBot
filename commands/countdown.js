const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
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
            // Join the voice channel
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            // Create audio player
            const player = createAudioPlayer();
            connection.subscribe(player);

            // Start countdown
            let currentNumber = countdownNumber;
            
            const playNextNumber = () => {
                if (currentNumber < 1) {
                    // Countdown finished
                    setTimeout(() => {
                        connection.destroy();
                    }, 2000);
                    return;
                }

                const audioPath = path.join(__dirname, '..', 'countdown_audio', `${currentNumber}.mp4`);
                
                // Check if audio file exists
                if (!fs.existsSync(audioPath)) {
                    console.log(`Audio file not found: ${audioPath}`);
                    currentNumber--;
                    playNextNumber();
                    return;
                }

                const resource = createAudioResource(audioPath);
                player.play(resource);

                player.once(AudioPlayerStatus.Idle, () => {
                    currentNumber--;
                    // Wait a moment before playing the next number
                    setTimeout(playNextNumber, 500);
                });
            };

            // Start the countdown
            playNextNumber();

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
