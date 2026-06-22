import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import axios from 'axios';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName('urban')
        .setDescription('Tìm kiếm định nghĩa trên Urban Dictionary')
        .addStringOption(option => 
            option.setName('term')
                .setDescription('Từ cần tra cứu trên Urban Dictionary')
                .setRequired(true)),
    
    async execute(interaction) {
        try {
            const term = interaction.options.getString('term');
            
            if (term.length < 2) {
                logger.warn('Lệnh urban - từ quá ngắn', {
                    userId: interaction.user.id,
                    term: term,
                    guildId: interaction.guildId
                });
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Lỗi', 'Vui lòng nhập một từ có ít nhất 2 ký tự.')],
                    flags: MessageFlags.Ephemeral
                });
            }
            
            const guildConfig = await getGuildConfig(interaction.client, interaction.guild?.id);
            if (guildConfig?.disabledCommands?.includes('urban')) {
                logger.warn('Lệnh urban bị vô hiệu hóa trong máy chủ', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                    commandName: 'urban'
                });
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Lệnh bị vô hiệu hóa', 'Lệnh Urban Dictionary đã bị vô hiệu hóa tại máy chủ này.')],
                    flags: MessageFlags.Ephemeral
                });
            }

            let deferTimer = null;
            const clearDeferTimer = () => {
                if (deferTimer) {
                    clearTimeout(deferTimer);
                    deferTimer = null;
                }
            };

            deferTimer = setTimeout(() => {
                InteractionHelper.safeDefer(interaction).catch((deferError) => {
                    logger.debug('Lỗi fallback khi defer lệnh urban', {
                        error: deferError?.message,
                        interactionId: interaction.id,
                        commandName: 'urban'
                    });
                });
            }, 1500);
            
            const response = await axios.get(
                `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
                { timeout: 5000 }
            );
            clearDeferTimer();
            
            if (!response.data?.list?.length) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed('Không tìm thấy', `Không tìm thấy định nghĩa cho "${term}" trên Urban Dictionary.`)]
                });
            }
            
            const definition = response.data.list[0];
            const cleanDefinition = definition.definition.replace(/\[|\]/g, '');
            const cleanExample = definition.example.replace(/\[|\]/g, '');
            
            const formattedDefinition = cleanDefinition
                .replace(/\n\s*\n/g, '\n\n')
                .slice(0, 2000);
                
            const formattedExample = cleanExample
                ? `*"${cleanExample.replace(/\n/g, ' ').slice(0, 500)}..."*`
                : '*Không có ví dụ nào được cung cấp*';
            
            const embed = createEmbed({
                title: definition.word,
                description: formattedDefinition,
                color: 'info'
            })
            .setURL(definition.permalink)
            .addFields(
                { 
                    name: 'Ví dụ', 
                    value: formattedExample,
                    inline: false 
                },
                { 
                    name: 'Thống kê', 
                    value: `👍 ${definition.thumbs_up.toLocaleString()} • 👎 ${definition.thumbs_down.toLocaleString()}`,
                    inline: true 
                },
                { 
                    name: 'Tác giả', 
                    value: definition.author || 'Ẩn danh',
                    inline: true 
                }
            )
            .setFooter({ 
                text: 'Urban Dictionary',
                iconURL: 'https://i.imgur.com/8aQrX3a.png' 
            });
                
            await InteractionHelper.safeReply(interaction, { embeds: [embed] });
            
            logger.info('Đã truy xuất định nghĩa Urban Dictionary', {
                userId: interaction.user.id,
                term: term,
                guildId: interaction.guildId,
                commandName: 'urban'
            });
            
        } catch (error) {
            logger.error('Lỗi Urban Dictionary', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                term: interaction.options.getString('term'),
                guildId: interaction.guildId,
                apiStatus: error.response?.status,
                commandName: 'urban'
            });
            
            if (error.response?.status === 404 || !error.response) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Không tìm thấy', `Không tìm thấy định nghĩa cho "${interaction.options.getString('term')}" trên Urban Dictionary.`)]
                });
            } else if (error.response?.status === 429) {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed('Đạt giới hạn yêu cầu', 'Quá nhiều yêu cầu gửi tới Urban Dictionary. Vui lòng thử lại sau vài phút.')]
                });
            } else {
                await handleInteractionError(interaction, error, {
                    commandName: 'urban',
                    source: 'urban_dictionary_api'
                });
            }
        }
    },
};