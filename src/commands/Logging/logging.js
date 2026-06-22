import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import dashboard from './modules/logging_dashboard.js';
import setchannel from './modules/logging_setchannel.js';
import filter from './modules/logging_filter.js';

export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Quản lý hệ thống nhật ký kiểm duyệt (logging) cho máy chủ.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName('dashboard')
                .setDescription('Mở bảng điều khiển nhật ký tương tác — xem trạng thái và bật/tắt các danh mục sự kiện.'),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName('setchannel')
                .setDescription('Thiết lập kênh gửi nhật ký kiểm duyệt cho máy chủ.')
                .addChannelOption((option) =>
                    option
                        .setName('channel')
                        .setDescription('Kênh văn bản dùng để gửi nhật ký.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                )
                .addBooleanOption((option) =>
                    option
                        .setName('disable')
                        .setDescription('Chọn True để tắt hoàn toàn nhật ký kiểm duyệt.')
                        .setRequired(false),
                ),
        )
        .addSubcommandGroup((group) =>
            group
                .setName('filter')
                .setDescription('Quản lý danh sách bỏ qua (các người dùng và kênh không ghi nhật ký).')
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('add')
                        .setDescription('Thêm người dùng hoặc kênh vào danh sách bỏ qua.')
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('Chọn loại đối tượng cần bỏ qua.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Người dùng', value: 'user' },
                                    { name: 'Kênh', value: 'channel' },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('ID của người dùng hoặc kênh cần bỏ qua.')
                                .setRequired(true),
                        ),
                )
                .addSubcommand((subcommand) =>
                    subcommand
                        .setName('remove')
                        .setDescription('Xóa người dùng hoặc kênh khỏi danh sách bỏ qua.')
                        .addStringOption((option) =>
                            option
                                .setName('type')
                                .setDescription('Loại đối tượng.')
                                .setRequired(true)
                                .addChoices(
                                    { name: 'Người dùng', value: 'user' },
                                    { name: 'Kênh', value: 'channel' },
                                ),
                        )
                        .addStringOption((option) =>
                            option
                                .setName('id')
                                .setDescription('ID của người dùng hoặc kênh cần xóa khỏi danh sách bỏ qua.')
                                .setRequired(true),
                        ),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'dashboard') {
                return await dashboard.execute(interaction, config, client);
            }

            await InteractionHelper.safeDefer(interaction);

            if (subcommand === 'setchannel') {
                return await setchannel.execute(interaction, config, client);
            }

            if (subcommandGroup === 'filter') {
                return await filter.execute(interaction, config, client);
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('Lệnh không xác định', 'Lệnh con này không được công nhận.')],
            });
        } catch (error) {
            logger.error('logging command error:', error);
            await InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Lỗi', 'Đã xảy ra lỗi không mong muốn.')],
                ephemeral: true,
            }).catch(() => {});
        }
    },
};