import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { createEmbed } from "../../utils/embeds.js";
import {
    createSelectMenu,
} from "../../utils/components.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CATEGORY_SELECT_ID = "help-category-select";
const ALL_COMMANDS_ID = "help-all-commands";
const BUG_REPORT_BUTTON_ID = "help-bug-report";
const HELP_MENU_TIMEOUT_MS = 5 * 60 * 1000;

const CATEGORY_ICONS = {
    Core: "ℹ️",
    Moderation: "🛡️",
    Economy: "💰",
    Fun: "🎮",
    Leveling: "📊",
    Utility: "🔧",
    Ticket: "🎫",
    Welcome: "👋",
    Giveaway: "🎉",
    Counter: "🔢",
    Tools: "🛠️",
    Search: "🔍",
    Reaction_Roles: "🎭",
    Community: "👥",
    Birthday: "🎂",
    Config: "⚙️",
};

export async function createInitialHelpMenu(client) {
    const commandsPath = path.join(__dirname, "../../commands");
    const categoryDirs = (
        await fs.readdir(commandsPath, { withFileTypes: true })
    )
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name)
        .sort();

    const options = [
        {
            label: "📋 Tất cả lệnh",
            description: "Xem danh sách toàn bộ lệnh của bot",
            value: ALL_COMMANDS_ID,
        },
        ...categoryDirs.map((category) => {
            const categoryName =
                category.charAt(0).toUpperCase() +
                category.slice(1).toLowerCase();
            const icon = CATEGORY_ICONS[categoryName] || "🔍";
            return {
                label: `${icon} ${categoryName}`,
                description: `Xem các lệnh thuộc nhóm ${categoryName}`,
                value: category,
            };
        }),
    ];

    const botName = client?.user?.username || "Bot";
    const embed = createEmbed({ 
        title: `🤖 Trung tâm trợ giúp ${botName}`,
        description: "Người bạn đồng hành toàn diện cho máy chủ của bạn: từ quản lý, kinh tế, giải trí đến các công cụ quản trị server.",
        color: 'primary'
    });

    embed.addFields(
        { name: "🛡️ **Quản trị**", value: "Quản lý máy chủ, kiểm soát người dùng và các công cụ thực thi luật.", inline: true },
        { name: "💰 **Kinh tế**", value: "Hệ thống tiền tệ, cửa hàng và các tính năng kinh tế ảo.", inline: true },
        { name: "🎮 **Giải trí**", value: "Trò chơi, giải trí và các lệnh tương tác thú vị.", inline: true },
        { name: "📊 **Cấp độ**", value: "Theo dõi cấp độ, hệ thống kinh nghiệm (XP) và tiến trình người dùng.", inline: true },
        { name: "🎫 **Vé hỗ trợ**", value: "Hệ thống tạo phiếu hỗ trợ (ticket) cho máy chủ.", inline: true },
        { name: "🎉 **Giveaway**", value: "Quản lý và tổ chức các chương trình quà tặng tự động.", inline: true },
        { name: "👋 **Chào mừng**", value: "Tin nhắn chào mừng thành viên mới và hướng dẫn người dùng.", inline: true },
        { name: "🎂 **Sinh nhật**", value: "Theo dõi ngày sinh nhật và tính năng ăn mừng.", inline: true },
        { name: "👥 **Cộng đồng**", value: "Công cụ quản lý cộng đồng và tương tác thành viên.", inline: true },
        { name: "⚙️ **Cấu hình**", value: "Quản lý thiết lập máy chủ và tùy chỉnh các chức năng bot.", inline: true },
        { name: "🔢 **Bộ đếm**", value: "Thiết lập kênh đếm số và điều khiển bộ đếm.", inline: true },
        { name: "🎙️ **Tạo phòng thoại**", value: "Tự động tạo và quản lý phòng thoại động.", inline: true },
        { name: "🎭 **Role phản ứng**", value: "Tự nhận role thông qua hệ thống phản ứng (reaction-roles).", inline: true },
        { name: "✅ **Xác minh**", value: "Quy trình xác minh thành viên và kiểm soát quyền truy cập.", inline: true },
        { name: "🔧 **Công cụ**", value: "Các công cụ hữu ích và tiện ích máy chủ khác.", inline: true }
    );

    embed.setFooter({ text: "Được tạo với Lughx ❤️" });
    embed.setTimestamp();

    const bugReportButton = new ButtonBuilder()
        .setCustomId(BUG_REPORT_BUTTON_ID)
        .setLabel("Báo cáo lỗi")
        .setStyle(ButtonStyle.Danger);

    const supportButton = new ButtonBuilder()
        .setLabel("Máy chủ hỗ trợ")
        .setURL("https://discord.gg/uGTcXGcJEY")
        .setStyle(ButtonStyle.Link);

    const touchpointButton = new ButtonBuilder()
        .setLabel("My Tiktok")
        .setURL("https://www.tiktok.com/@zbim08")
        .setStyle(ButtonStyle.Link);

    const selectRow = createSelectMenu(
        CATEGORY_SELECT_ID,
        "Chọn để xem các lệnh",
        options,
    );

    const buttonRow = new ActionRowBuilder().addComponents([
        bugReportButton,
        supportButton,
        touchpointButton,
    ]);

    return {
        embeds: [embed],
        components: [buttonRow, selectRow],
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Hiển thị menu trợ giúp với tất cả các lệnh khả dụng"),

    async execute(interaction, guildConfig, client) {
        await InteractionHelper.safeDefer(interaction);
        
        const { embeds, components } = await createInitialHelpMenu(client);

        await InteractionHelper.safeEditReply(interaction, {
            embeds,
            components,
        });

        setTimeout(async () => {
            try {
                const closedEmbed = createEmbed({
                    title: "Menu trợ giúp đã đóng",
                    description: "Menu trợ giúp đã hết hạn, vui lòng gõ /help để mở lại.",
                    color: "secondary",
                });

                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [closedEmbed],
                    components: [],
                });
            } catch (error) {
                // Xử lý im lặng nếu tương tác đã bị xóa hoặc lỗi
            }
        }, HELP_MENU_TIMEOUT_MS);
    },
};