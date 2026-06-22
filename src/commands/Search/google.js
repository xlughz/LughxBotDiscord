import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName('google')
        .setDescription('Tìm kiếm trên Google')
        .addStringOption(option => 
            option.setName('query')
                .setDescription('Bạn muốn tìm kiếm nội dung gì?')
                .setRequired(true)),
    async execute(interaction) {
        try {
            const query = interaction.options.getString('query');
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            
            const embed = createEmbed({
                title: 'Tìm kiếm Google',
                description: `[Tìm kiếm "${query}"](${searchUrl})`,
                color: 'info'
            })
            .setFooter({ text: 'Kết quả tìm kiếm Google' });

            await InteractionHelper.safeReply(interaction, { embeds: [embed] });
            
            logger.info('Liên kết tìm kiếm Google đã được tạo', {
                userId: interaction.user.id,
                query: query,
                guildId: interaction.guildId,
                commandName: 'google'
            });
        } catch (error) {
            logger.error('Lỗi trong lệnh google', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'google'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'google',
                source: 'google_search'
            });
        }
    },
};