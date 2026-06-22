import { getColor } from '../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import ticketConfig from './modules/ticket_dashboard.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Quản lý hệ thống vé hỗ trợ của máy chủ.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("setup")
                .setDescription("Thiết lập bảng tạo vé trong một kênh chỉ định.")
                .addChannelOption((option) =>
                    option
                        .setName("panel_channel")
                        .setDescription("Kênh gửi bảng tạo vé.")
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("panel_message")
                        .setDescription("Thông báo/Mô tả chính cho bảng tạo vé.")
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option
                        .setName("button_label")
                        .setDescription("Nhãn cho nút tạo vé (mặc định: Tạo vé)")
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("category")
                        .setDescription("Danh mục tạo vé mới (tùy chọn).")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addChannelOption((option) =>
                    option
                        .setName("closed_category")
                        .setDescription("Danh mục chứa các vé đã đóng (tùy chọn).")
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(false),
                )
                .addRoleOption((option) =>
                    option
                        .setName("staff_role")
                        .setDescription("Vai trò có quyền truy cập vé (tùy chọn).")
                        .setRequired(false),
                )
                .addIntegerOption((option) =>
                    option
                        .setName("max_tickets_per_user")
                        .setDescription("Số vé tối đa mỗi người dùng được tạo (mặc định: 3)")
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName("dm_on_close")
                        .setDescription("Gửi tin nhắn riêng cho người dùng khi vé đóng (mặc định: true)")
                        .setRequired(false),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("dashboard")
                .setDescription("Mở bảng điều khiển hệ thống vé tương tác"),
        ),
    category: "ticket",

    async execute(interaction, config, client) {
        try {
            const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferred) return;

            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
                logger.warn('Quyền truy cập lệnh vé bị từ chối', { userId: interaction.user.id, guildId: interaction.guildId });
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed("Từ chối quyền truy cập", "Bạn cần quyền `Quản lý kênh` để thực hiện hành động này.")],
                });
            }

            const subcommand = interaction.options.getSubcommand();
            if (subcommand === "dashboard") return ticketConfig.execute(interaction, config, client);

            if (subcommand === "setup") {
                const existingConfig = await getGuildConfig(client, interaction.guildId);
                if (existingConfig?.ticketPanelChannelId) {
                    return await InteractionHelper.safeEditReply(interaction, {
                        embeds: [
                            errorEmbed(
                                'Hệ thống vé đã hoạt động',
                                `Máy chủ này đã được thiết lập hệ thống vé (bảng chọn tại <#${existingConfig.ticketPanelChannelId}>).\n\nChỉ hỗ trợ một hệ thống vé mỗi máy chủ. Sử dụng \`/ticket dashboard\` để chỉnh sửa hoặc chọn **Xóa hệ thống** từ bảng điều khiển để thiết lập lại.`,
                            ),
                        ],
                    });
                }

                const panelChannel = interaction.options.getChannel("panel_channel");
                const categoryChannel = interaction.options.getChannel("category");
                const closedCategoryChannel = interaction.options.getChannel("closed_category");
                const staffRole = interaction.options.getRole("staff_role");
                const panelMessage = interaction.options.getString("panel_message") || "Nhấn nút bên dưới để tạo yêu cầu hỗ trợ.";
                const buttonLabel = interaction.options.getString("button_label") || "Tạo vé";
                const maxTicketsPerUser = interaction.options.getInteger("max_tickets_per_user") || 3;
                const dmOnClose = interaction.options.getBoolean("dm_on_close") !== false;

                const setupEmbed = createEmbed({ 
                    title: "🎫 Vé hỗ trợ", 
                    description: panelMessage,
                    color: getColor('info')
                });

                const ticketButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("create_ticket")
                        .setLabel(buttonLabel)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("📩"),
                );

                await panelChannel.send({ embeds: [setupEmbed], components: [ticketButton] });

                if (client.db && interaction.guildId) {
                    const currentConfig = existingConfig || {};
                    currentConfig.ticketCategoryId = categoryChannel?.id || null;
                    currentConfig.ticketClosedCategoryId = closedCategoryChannel?.id || null;
                    currentConfig.ticketStaffRoleId = staffRole?.id || null;
                    currentConfig.ticketPanelChannelId = panelChannel.id;
                    currentConfig.ticketPanelMessage = panelMessage;
                    currentConfig.ticketButtonLabel = buttonLabel;
                    currentConfig.maxTicketsPerUser = maxTicketsPerUser;
                    currentConfig.dmOnClose = dmOnClose;

                    const { getGuildConfigKey } = await import('../../utils/database.js');
                    await client.db.set(getGuildConfigKey(interaction.guildId), currentConfig);
                }

                let successMessage = `Bảng tạo vé đã được gửi tới ${panelChannel}. `;
                successMessage += categoryChannel ? `Vé mới sẽ được tạo trong danh mục **${categoryChannel.name}**. ` : 'Vé mới sẽ được tạo trong danh mục "Tickets" mới. ';
                if (closedCategoryChannel) successMessage += `Vé đã đóng sẽ được chuyển tới **${closedCategoryChannel.name}**. `;
                if (staffRole) successMessage += `**${staffRole.name}** sẽ có quyền truy cập vé. `;
                successMessage += `\n\n**Số vé tối đa mỗi người:** ${maxTicketsPerUser}\n**Tin nhắn khi đóng:** ${dmOnClose ? 'Đã bật' : 'Đã tắt'}`;

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [successEmbed("Thiết lập bảng vé thành công", successMessage)],
                });
            }
        } catch (error) {
            logger.error('Lỗi khi thực thi lệnh ticket', { error: error.message, stack: error.stack });
            await handleInteractionError(interaction, error, { commandName: 'ticket', source: 'ticket_command_main' });
        }
    }
};