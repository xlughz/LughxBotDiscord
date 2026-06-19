import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getUserBirthday } from '../../../services/birthdayService.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const targetUser = interaction.options.getUser("user") || interaction.user;
            const userId = targetUser.id;
            const guildId = interaction.guildId;

            // Lấy dữ liệu ngày sinh nhật từ service
            const birthdayData = await getUserBirthday(client, guildId, userId);

            if (!birthdayData) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '❌ Không Tìm Thấy Ngày Sinh',
                        description: targetUser.id === interaction.user.id 
                            ? "Bạn chưa thiết lập ngày sinh nhật của mình. Hãy dùng lệnh `/birthday set` để thêm nhé!"
                            : `Thành viên **${targetUser.username}** chưa thiết lập ngày sinh nhật trên máy chủ này.`,
                        color: 'error'
                    })]
                });
            }
            
            const embed = createEmbed({
                title: "🎂 Thông Tin Sinh Nhật",
                description: `**Ngày sinh:** Tháng ${birthdayData.monthName} ngày ${birthdayData.day}\n**Thành viên:** ${targetUser.toString()}`,
                color: 'info',
                footer: targetUser.id === interaction.user.id ? "Sinh nhật của bạn" : `Sinh nhật của ${targetUser.username}`
            });
            
            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Birthday info retrieved successfully', {
                userId: interaction.user.id,
                targetUserId: targetUser.id,
                guildId,
                commandName: 'birthday_info'
            });
        } catch (error) {
            logger.error("Birthday info command execution failed", {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday_info'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday_info',
                source: 'birthday_info_module'
            });
        }
    }
};