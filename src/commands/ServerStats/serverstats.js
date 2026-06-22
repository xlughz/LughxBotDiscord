import { getColor } from '../../../config/bot.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';

import { handleCreate } from './modules/serverstats_create.js';
import { handleList } from './modules/serverstats_list.js';
import { handleUpdate } from './modules/serverstats_update.js';
import { handleDelete } from './modules/serverstats_delete.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("serverstats")
        .setDescription("Quản lý thống kê máy chủ (theo dõi số lượng thành viên và kênh)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(subcommand =>
            subcommand
                .setName("create")
                .setDescription("Tạo kênh theo dõi thống kê mới trong một danh mục")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Loại thống kê cần theo dõi")
                        .setRequired(true)
                        .addChoices(
                            { name: "Tổng thành viên + bot", value: "members" },
                            { name: "Chỉ thành viên", value: "members_only" },
                            { name: "Chỉ bot", value: "bots" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("channel_type")
                        .setDescription("Loại kênh sẽ tạo cho bộ theo dõi này")
                        .setRequired(true)
                        .addChoices(
                            { name: "Kênh thoại (khuyên dùng)", value: "voice" },
                            { name: "Kênh văn bản", value: "text" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("category")
                        .setDescription("Danh mục nơi kênh thống kê sẽ được tạo")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildCategory)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Liệt kê tất cả các bộ theo dõi thống kê cho máy chủ này")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("update")
                .setDescription("Cập nhật một bộ theo dõi thống kê hiện có")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("ID của bộ theo dõi cần cập nhật")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Loại theo dõi mới")
                        .setRequired(false)
                        .addChoices(
                            { name: "Tổng thành viên + bot", value: "members" },
                            { name: "Chỉ thành viên", value: "members_only" },
                            { name: "Chỉ bot", value: "bots" }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("Xóa một bộ theo dõi thống kê hiện có")
                .addStringOption(option =>
                    option
                        .setName("counter-id")
                        .setDescription("ID của bộ theo dõi cần xóa")
                        .setRequired(true)
                )
        ),

    async execute(interaction, guildConfig, client) {
        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case "create":
                    await handleCreate(interaction, client);
                    break;
                case "list":
                    await handleList(interaction, client);
                    break;
                case "update":
                    await handleUpdate(interaction, client);
                    break;
                case "delete":
                    await handleDelete(interaction, client);
                    break;
                default:
                    await InteractionHelper.safeReply(interaction, {
                        embeds: [errorEmbed("Lệnh con không xác định.")],
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            logger.error(`Lỗi trong lệnh serverstats ${subcommand}:`, error);
            
            const errorEmbedMsg = createEmbed({ 
                title: "❌ Lỗi", 
                description: "Đã xảy ra lỗi khi xử lý yêu cầu của bạn.",
                color: getColor('error')
            });

            if (!interaction.replied && !interaction.deferred) {
                await InteractionHelper.safeReply(interaction, { embeds: [errorEmbedMsg], flags: MessageFlags.Ephemeral }).catch(logger.error);
            } else {
                await interaction.followUp({ embeds: [errorEmbedMsg], flags: MessageFlags.Ephemeral }).catch(logger.error);
            }
        }
    }
};