const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');
const ffprobe = require('ffprobe-static');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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
    
    // Function to get actual audio duration using ffprobe
    async getAudioDuration(filePath) {
        try {
            const { stdout } = await execAsync(`"${ffprobe}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`);
            return parseFloat(stdout.trim()) * 1000; // Convert to milliseconds
        } catch (error) {
            console.log(`Could not get duration for ${filePath}, using default 1500ms`);
            return 1500; // Default fallback
        }
    },

    // Function to detect silence and get effective audio duration
    async getEffectiveAudioDuration(filePath) {
        try {
            // Detect silence at start and end, get the actual speech duration
            const { stdout } = await execAsync(`"${ffprobe}" -f lavfi -i "amovie='${filePath}',silencedetect=noise=0.01:duration=0.1" -show_entries tags=lavfi.silence_start,lavfi.silence_end -of csv=p=0 -v quiet`);
            
            const totalDuration = await this.getAudioDuration(filePath);
            
            if (!stdout.trim()) {
                return totalDuration; // No silence detected, use full duration
            }

            // Parse silence detection results to find actual speech portion
            const lines = stdout.trim().split('\n').filter(line => line);
            let speechStart = 0;
            let speechEnd = totalDuration / 1000;

            for (const line of lines) {
                if (line.includes('silence_start')) {
                    const silenceStart = parseFloat(line.split(',')[1]);
                    if (silenceStart > speechEnd * 0.8) { // Silence near the end
                        speechEnd = silenceStart;
                    }
                } else if (line.includes('silence_end')) {
                    const silenceEnd = parseFloat(line.split(',')[1]);
                    if (silenceEnd < speechEnd * 0.2) { // Silence near the beginning
                        speechStart = silenceEnd;
                    }
                }
            }

            const effectiveDuration = (speechEnd - speechStart) * 1000;
            return Math.max(effectiveDuration, 800); // Minimum 0.8 seconds
        } catch (error) {
            console.log(`Could not analyze silence for ${filePath}, using default duration`);
            return await this.getAudioDuration(filePath);
        }
    },
    
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

            // Calculate timing for equal spacing
            const totalDuration = countdownNumber * 1000; // Total duration in milliseconds
            const audioClipDuration = 1500; // Assume average 1.5 seconds per audio clip
            const totalClips = countdownNumber; // Number of audio clips to play
            const totalAudioTime = totalClips * audioClipDuration;
            const totalGapTime = totalDuration - totalAudioTime;
            const gapBetweenClips = Math.max(0, totalGapTime / (totalClips - 1)); // Gap between clips

            console.log(`Countdown timing: ${totalDuration}ms total, ${gapBetweenClips.toFixed(0)}ms gaps`);

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
                    if (currentNumber >= 1) {
                        // Wait for calculated gap time before playing next number
                        setTimeout(playNextNumber, gapBetweenClips);
                    } else {
                        // Last number played, finish countdown
                        playNextNumber();
                    }
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
