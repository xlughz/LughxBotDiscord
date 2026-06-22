import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const SUPPORT_SERVER_URL = "https://discord.gg/6Z4wfKJ43m"; // Hãy đảm bảo link này là của bạn

export default {
    data: new SlashCommandBuilder()
        .setName("support")
        .setDescription("Nhận link tham gia máy chủ hỗ trợ"),

    async execute(interaction) {
        try {
            const supportButton = new ButtonBuilder()
                .setLabel("Tham gia máy chủ hỗ trợ")
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_SERVER_URL);

            const actionRow = new ActionRowBuilder().addComponents(supportButton);

            await InteractionHelper.safeReply(interaction, {
                embeds: [
                    createEmbed({ 
                        title: "🚑 Bạn Cần Hỗ Trợ?", 
                        description: "Tham gia máy chủ hỗ trợ chính thức của chúng tôi để nhận sự trợ giúp, báo cáo lỗi hoặc đề xuất tính năng mới. Nếu bạn đang tùy chỉnh con bot này, hãy nhớ thay đổi đường dẫn trong mã nguồn!" 
                    }),
                ],
                components: [actionRow],
                flags: MessageFlags.Ephemeral,
            });
        } catch (error) {
            logger.error('Support command error:', error);
            
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({ title: 'Lỗi Hệ Thống', description: 'Không thể hiển thị thông tin hỗ trợ.', color: 'error' })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('Failed to send error reply:', replyError);
            }
        }
    },
};