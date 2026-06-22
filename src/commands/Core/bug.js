import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName("bug")
        .setDescription("Báo cáo lỗi hoặc sự cố của bot"),

    async execute(interaction) {
        const githubButton = new ButtonBuilder()
            .setLabel('Báo cáo lỗi trên GitHub')
            .setStyle(ButtonStyle.Link)
            .setURL('https://github.com/xlughz'); // Hãy thay URL GitHub của bạn vào đây

        const row = new ActionRowBuilder().addComponents(githubButton);

        const bugReportEmbed = createEmbed({
            title: '🐛 Báo Cáo Lỗi (Bug Report)',
            description: 'Bạn đã tìm thấy lỗi? Hãy báo cáo nó trên trang GitHub Issues của chúng tôi!\n\n' +
            '**Khi báo cáo lỗi, vui lòng bao gồm:**\n' +
            '• 📝 Mô tả chi tiết về sự cố\n' +
            '• 👣 Các bước để tái hiện lỗi\n' +
            '• 📸 Ảnh chụp màn hình (nếu có)\n' +
            '• 🤖 Phiên bản bot và môi trường đang chạy\n\n' +
            'Điều này giúp chúng tôi sửa lỗi nhanh hơn và hiệu quả hơn!',
            color: 'error'
        })
            .setTimestamp();

        await InteractionHelper.safeReply(interaction, {
            embeds: [bugReportEmbed],
            components: [row],
        });
    },
};