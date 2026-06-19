import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getAllBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const guildId = interaction.guildId;
            
            // Lấy toàn bộ danh sách sinh nhật đã sắp xếp
            const sortedBirthdays = await getAllBirthdays(client, guildId);

            if (sortedBirthdays.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '❌ Không Có Dữ Liệu',
                        description: 'Chưa có thành viên nào thiết lập ngày sinh nhật trên máy chủ này.',
                        color: 'error'
                    })]
                });
            }

            const embed = createEmbed({
                title: "🎂 Danh Sách Sinh Nhật Máy Chủ",
                color: 'info'
            });

            // Lấy hàng loạt thành viên để xác minh xem ai còn trong máy chủ
            const userIds = sortedBirthdays.map(b => b.userId);
            const fetchedMembers = await interaction.guild.members.fetch({ user: userIds }).catch(() => null);

            let birthdayList = '';
            let displayIndex = 0;
            const staleUserIds = [];

            for (const birthday of sortedBirthdays) {
                if (fetchedMembers && !fetchedMembers.has(birthday.userId)) {
                    staleUserIds.push(birthday.userId);
                    continue;
                }
                displayIndex++;
                birthdayList += `${displayIndex}. <@${birthday.userId}> - Tháng ${birthday.monthName} ngày ${birthday.day}\n`;
            }

            // Dọn dẹp dữ liệu sinh nhật của những thành viên đã rời máy chủ
            if (fetchedMembers && staleUserIds.length > 0) {
                for (const userId of staleUserIds) {
                    deleteBirthday(client, guildId, userId).catch(() => null);
                }
            }

            if (displayIndex === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [createEmbed({
                        title: '❌ Không Có Dữ Liệu',
                        description: 'Không có ngày sinh nhật nào được thiết lập bởi các thành viên hiện tại.',
                        color: 'error'
                    })]
                });
            }

            birthdayList = `**Có ${displayIndex} ngày sinh nhật trong máy chủ ${interaction.guild.name}**\n\n` + birthdayList;

            embed.setDescription(birthdayList);
            embed.setFooter({ text: `Tổng cộng: ${displayIndex} ngày sinh nhật` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Birthday list retrieved successfully', {
                userId: interaction.user.id,
                guildId,
                birthdayCount: displayIndex,
                staleRemoved: staleUserIds.length,
                commandName: 'birthday_list'
            });
        } catch (error) {
            logger.error("Birthday list command execution failed", {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'birthday_list'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'birthday_list',
                source: 'birthday_list_module'
            });
        }
    }
};