import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

import shopBrowse from './modules/shop_browse.js';
import shopConfigSetrole from './modules/shop_config_setrole.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Các lệnh liên quan đến cửa hàng kinh tế.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('browse')
                .setDescription('Duyệt qua cửa hàng kinh tế.'),
        )
        .addSubcommandGroup(group =>
            group
                .setName('config')
                .setDescription('Cấu hình cài đặt cửa hàng. (Yêu cầu quyền Quản lý máy chủ)')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('setrole')
                        .setDescription('Thiết lập role được cấp khi mua vật phẩm Premium Role.')
                        .addRoleOption(option =>
                            option
                                .setName('role')
                                .setDescription('Role sẽ được cấp khi mua vật phẩm Premium Role.')
                                .setRequired(true),
                        ),
                ),
        ),

    async execute(interaction, config, client) {
        try {
            const subcommandGroup = interaction.options.getSubcommandGroup(false);
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'browse') {
                return await shopBrowse.execute(interaction, config, client);
            }

            if (subcommandGroup === 'config' && subcommand === 'setrole') {
                return await shopConfigSetrole.execute(interaction, config, client);
            }

            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Lỗi', 'Lệnh con không xác định.')],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('shop command error:', error);
            await InteractionHelper.safeReply(interaction, {
                content: '❌ Đã xảy ra lỗi khi thực thi lệnh cửa hàng.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
    },
};