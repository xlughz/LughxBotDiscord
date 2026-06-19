import { MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getUpcomingBirthdays } from '../../../services/birthdayService.js';
import { deleteBirthday } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import { handleInteractionError } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction);
            
            // Lấy danh sách 5 sinh nhật sắp tới
            const next5 = await getUpcomingBirthdays(client, interaction.guildId, 5);

            if (next5.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: '❌ Không Tìm Thấy Ngày Sinh',
                            description: 'Chưa có ngày sinh nhật nào được thiết lập trên máy chủ này. Hãy dùng lệnh `/birthday set` để thêm nhé!',
                            color: 'error'
                        })
                    ]
                });
            }

            const embed = createEmbed({
                title: '🎂 5 Ngày Sinh Nhật Sắp Tới',
                description: `Dưới đây là 5 ngày sinh nhật tiếp theo trong máy chủ ${interaction.guild.name}:`,
                color: 'info'
            });

            let displayIndex = 0;
            for (const birthday of next5) {
                const member = await interaction.guild.members.fetch(birthday.userId).catch(() => null);
                if (!member) {
                    deleteBirthday(client, interaction.guildId, birthday.userId).catch(() => null);
                    continue;
                }
                displayIndex++;

                let timeUntil = '';
                if (birthday.daysUntil === 0) {
                    timeUntil = '🎉 **Hôm nay!**';
                } else if (birthday.daysUntil === 1) {
                    timeUntil = '📅 **Ngày mai!**';
                } else {
                    timeUntil = `Còn ${birthday.daysUntil} ngày nữa`;
                }

                embed.addFields({
                    name: `${displayIndex}. ${member.displayName}`,
                    value: `<@${birthday.userId}>\n📅 **Ngày sinh:** Tháng ${birthday.monthName} ngày ${birthday.day}\n⏰ **Thời gian:** ${timeUntil}`,
                    inline: false
                });
            }

            if (displayIndex === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        createEmbed({
                            title: '❌ Không Có Sinh Nhật Sắp Tới',
                            description: 'Không tìm thấy ngày sinh nhật sắp tới nào từ các thành viên hiện tại.',
                            color: 'error'
                        })
                    ]
                });
            }

            embed.setFooter({
                text: 'Sử dụng lệnh /birthday set để thêm ngày sinh nhật của bạn!',
                iconURL: interaction.guild.iconURL()
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            
            logger.info('Next birthdays retrieved successfully', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                upcomingCount: displayIndex,
                commandName: 'next_birthdays'
            });
        } catch (error) {
            logger.error('Next birthdays command execution failed', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'next_birthdays'
            });
            await handleInteractionError(interaction, error, {
                commandName: 'next_birthdays',
                source: 'next_birthdays_module'
            });
        }
    }
};