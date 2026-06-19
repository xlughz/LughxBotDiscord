const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder 
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play-ui')
        .setDescription('Hiển thị giao diện nghe nhạc tuyệt đẹp'),

    async execute(interaction) {
        // 1. Phản hồi chờ (vì việc vẽ ảnh mất vài mili-giây)
        await interaction.deferReply();

        // Dữ liệu giả lập của bài hát (sau này bạn sẽ lấy từ play-dl)
        const songData = {
            title: "Top 50 Most Popular Songs by NCS...",
            author: "AeroX Music",
            thumbnail: "https://img.youtube.com/vi/K4DyBUG242c/hqdefault.jpg" // Ảnh nền video
        };

        // ==========================================
        // PHẦN 1: VẼ BỨC ẢNH GIAO DIỆN BẰNG CANVAS
        // ==========================================
        const canvas = createCanvas(800, 250);
        const ctx = canvas.getContext('2d');

        // Vẽ nền tối (Dark mode)
        ctx.fillStyle = '#181a1d'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Load ảnh thumbnail từ URL
        const thumbImage = await loadImage(songData.thumbnail);
        
        // Vẽ ảnh mờ làm background (tùy chọn để giống ảnh mẫu)
        ctx.filter = 'blur(10px) brightness(40%)';
        ctx.drawImage(thumbImage, 0, -100, 800, 450);
        ctx.filter = 'none'; // Tắt hiệu ứng mờ

        // Vẽ lại ảnh thumbnail vuông vức ở bên trái (kích thước 180x180)
        ctx.drawImage(thumbImage, 35, 35, 180, 180);

        // Viết chữ "Playing from youtube"
        ctx.font = '20px Arial';
        ctx.fillStyle = '#a0a0a0';
        ctx.fillText('Playing from youtube', 240, 70);

        // Viết Tên bài hát (Cắt ngắn nếu quá dài)
        ctx.font = 'bold 35px Arial';
        ctx.fillStyle = '#ffffff';
        let displayTitle = songData.title.length > 25 ? songData.title.substring(0, 25) + '...' : songData.title;
        ctx.fillText(displayTitle, 240, 120);

        // Viết Tên Tác giả / Kênh
        ctx.font = '25px Arial';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(songData.author, 240, 160);

        // Viết Thời gian
        ctx.font = '18px Arial';
        ctx.fillStyle = '#a0a0a0';
        ctx.fillText('0:00 / LIVE', 240, 200);

        // Chuyển bản vẽ thành file ảnh thực tế
        const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'music-card.png' });

        // ==========================================
        // PHẦN 2: TẠO GIAO DIỆN DISCORD EMBED & BUTTONS
        // ==========================================
        
        const musicEmbed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setImage('attachment://music-card.png') // Gọi bức ảnh vừa tạo lên đây
            .setDescription(`🎵 **Now Playing...**\n[${songData.title}](https://youtube.com)`);

        // Hàng nút 1: Điều khiển phát nhạc
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pause').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('stop').setEmoji('⏹️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('replay').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
        );

        // Hàng nút 2: Tính năng mở rộng
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lyrics').setEmoji('🎵').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('add').setEmoji('📥').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('filter').setEmoji('🎛️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('like').setEmoji('🤍').setStyle(ButtonStyle.Secondary)
        );

        // Gửi kết quả cuối cùng ra kênh Discord
        await interaction.editReply({ 
            embeds: [musicEmbed], 
            components: [row1, row2], 
            files: [attachment] 
        });
    },
};