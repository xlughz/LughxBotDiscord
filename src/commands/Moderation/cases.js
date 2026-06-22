import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getModerationCases } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('Xem các vụ việc kiểm duyệt và nhật ký kiểm toán')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewAuditLog)
        .setDMPermission(false)
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Lọc các vụ việc theo loại hoặc người dùng')
                .addChoices(
                    { name: 'Tất cả vụ việc', value: 'all' },
                    { name: 'Cấm (Bans)', value: 'Member Banned' },
                    { name: 'Đá (Kicks)', value: 'Member Kicked' },
                    { name: 'Đình chỉ (Timeouts)', value: 'Member Timed Out' },
                    { name: 'Cảnh báo (Warnings)', value: 'User Warned' }
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Lọc vụ việc theo một người dùng cụ thể')
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Số lượng vụ việc muốn hiển thị (mặc định: 10)')
                .setMinValue(1)
                .setMaxValue(50)
        ),

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Lỗi defer tương tác lệnh cases`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'cases'
            });
            return;
        }

        try {
            const filterType = interaction.options.getString('filter') || 'all';
            const targetUser = interaction.options.getUser('user');
            const limit = interaction.options.getInteger('limit') || 10;

            const filters = {
                limit,
                action: filterType === 'all' ? undefined : filterType,
                userId: targetUser?.id
            };

            const cases = await getModerationCases(interaction.guild.id, filters);

            if (cases.length === 0) {
                throw new Error(targetUser 
                    ? `Không tìm thấy vụ việc kiểm duyệt nào cho ${targetUser.tag}`
                    : `Không tìm thấy ${filterType === 'all' ? '' : filterType} vụ việc kiểm duyệt nào trong máy chủ này.`
                );
            }

            const CASES_PER_PAGE = 5;
            const totalPages = Math.ceil(cases.length / CASES_PER_PAGE);
            let currentPage = 1;

            const createCasesEmbed = (page) => {
                const startIndex = (page - 1) * CASES_PER_PAGE;
                const endIndex = startIndex + CASES_PER_PAGE;
                const pageCases = cases.slice(startIndex, endIndex);

                const embed = createEmbed({
                    title: '📋 Các vụ việc kiểm duyệt',
                    description: `Hiển thị các vụ việc kiểm duyệt cho **${interaction.guild.name}**\n\n**Trang ${page} trên ${totalPages}**`
                });

                pageCases.forEach(case_ => {
                    const date = new Date(case_.createdAt).toLocaleDateString();
                    const time = new Date(case_.createdAt).toLocaleTimeString();
                    
                    embed.addFields({
                        name: `Vụ việc #${case_.caseId} - ${case_.action}`,
                        value: `**Đối tượng:** ${case_.target}\n**Người thực hiện:** ${case_.executor}\n**Ngày:** ${date} lúc ${time}\n**Lý do:** ${case_.reason || 'Không có lý do'}`,
                        inline: false
                    });
                });

                embed.setFooter({
                    text: `Tổng số vụ việc: ${cases.length} | Lọc: ${filterType}${targetUser ? ` | Người dùng: ${targetUser.tag}` : ''}`
                });

                return embed;
            };

            const createNavigationRow = (page) => {
                const row = new ActionRowBuilder();
                
                const prevButton = new ButtonBuilder()
                    .setCustomId('prev_page')
                    .setLabel('⬅️ Trước')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1);

                const pageInfoButton = new ButtonBuilder()
                    .setCustomId('page_info')
                    .setLabel(`Trang ${page}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true);

                const nextButton = new ButtonBuilder()
                    .setCustomId('next_page')
                    .setLabel('Sau ➡️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages);

                row.addComponents(prevButton, pageInfoButton, nextButton);
                return row;
            };

            const message = await interaction.editReply({ 
                embeds: [createCasesEmbed(currentPage)], 
                components: [createNavigationRow(currentPage)]
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 120000
            });

            collector.on('collect', async (buttonInteraction) => {
                await buttonInteraction.deferUpdate();

                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.followUp({
                        content: 'Bạn không thể sử dụng các nút này. Hãy chạy lệnh `/cases` để xem bảng vụ việc của riêng bạn.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const { customId } = buttonInteraction;

                if (customId === 'prev_page' && currentPage > 1) {
                    currentPage--;
                } else if (customId === 'next_page' && currentPage < totalPages) {
                    currentPage++;
                }

                await buttonInteraction.editReply({
                    embeds: [createCasesEmbed(currentPage)],
                    components: [createNavigationRow(currentPage)]
                });
            });

            collector.on('end', async () => {
                const disabledRow = createNavigationRow(currentPage);
                disabledRow.components.forEach(button => button.setDisabled(true));
                
                try {
                    await message.edit({
                        components: [disabledRow]
                    });
                } catch (error) {
                    logger.error('Lỗi khi tắt nút điều hướng cases:', error);
                }
            });

        } catch (error) {
            logger.error('Lỗi trong lệnh cases:', error);
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        'Lỗi hệ thống',
                        'Đã xảy ra lỗi khi truy xuất các vụ việc kiểm duyệt. Vui lòng thử lại sau.'
                    )
                ],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};