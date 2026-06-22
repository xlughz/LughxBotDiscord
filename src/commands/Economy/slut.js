import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const SLUT_COOLDOWN = 45 * 60 * 1000;

const SLUT_ACTIVITIES = [
    { name: "Livestream", min: 120, max: 450, risk: 0.2 },
    { name: "Nhảy cá nhân", min: 220, max: 700, risk: 0.25 },
    { name: "Chủ trì sự kiện", min: 320, max: 900, risk: 0.3 },
    { name: "Dịch vụ đồng hành VIP", min: 550, max: 1400, risk: 0.35 },
    { name: "Livestream độc quyền", min: 850, max: 2200, risk: 0.4 },
];

const POSITIVE_OUTCOMES = [
    "Buổi livestream cực cháy và tiền tip bay tới tấp.",
    "Một khách VIP đã trả nhiều hơn mong đợi.",
    "Ca làm việc của bạn chật kín khách và đem lại lợi nhuận cao.",
    "Các yêu cầu đặc biệt được hoàn thành và thu nhập của bạn tăng vọt.",
];

const FINE_OUTCOMES = [
    "Bảo vệ địa điểm đã phạt bạn vì vi phạm quy định.",
    "Một cảnh báo vi phạm đã kích hoạt phí nền tảng.",
    "Bạn đã bị gắn cờ và phải nộp một khoản phí phạt.",
];

const ROBBED_OUTCOMES = [
    "Một tài khoản giả mạo đã hủy thanh toán khiến bạn mất sạch thu nhập.",
    "Một kẻ lừa đảo đã cuỗm đi một phần tiền mặt của bạn.",
    "Bạn bị một tài khoản lừa đảo dụ dỗ và mất tiền oan.",
];

const LOSS_OUTCOMES = [
    "Buổi diễn thất bại và bạn phải tự chi trả chi phí vận hành.",
    "Bạn đã đốt hết ngân sách chuẩn bị mà không thu lại được gì.",
    "Mọi thứ diễn ra không như ý khiến bạn bị lỗ vốn.",
];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function resolveOutcome(activity, wallet) {
    const successChance = Math.max(0.35, 0.55 - activity.risk * 0.2);
    const fineChance = 0.22;
    const robbedChance = 0.2;
    const roll = Math.random();

    if (roll < successChance) {
        const amount = randomInt(activity.min, activity.max);
        return {
            type: 'payout',
            delta: amount,
            message: randomChoice(POSITIVE_OUTCOMES),
            title: `💰 ${activity.name} - Thành công`
        };
    }

    const remainingAfterSuccess = roll - successChance;

    if (remainingAfterSuccess < fineChance) {
        const maxFine = Math.min(wallet, Math.max(150, Math.floor(activity.max * 0.4)));
        const minFine = Math.min(maxFine, Math.max(50, Math.floor(activity.min * 0.2)));
        const amount = maxFine > 0 ? randomInt(minFine, maxFine) : 0;
        return {
            type: 'fine',
            delta: -amount,
            message: randomChoice(FINE_OUTCOMES),
            title: `🚨 ${activity.name} - Bị phạt`
        };
    }

    if (remainingAfterSuccess < fineChance + robbedChance) {
        const maxRobbed = Math.min(wallet, Math.max(200, Math.floor(wallet * 0.35)));
        const minRobbed = Math.min(maxRobbed, Math.max(75, Math.floor(wallet * 0.1)));
        const amount = maxRobbed > 0 ? randomInt(minRobbed, maxRobbed) : 0;
        return {
            type: 'robbed',
            delta: -amount,
            message: randomChoice(ROBBED_OUTCOMES),
            title: `🕵️ ${activity.name} - Bị cướp`
        };
    }

    const maxLoss = Math.min(wallet, Math.max(100, Math.floor(activity.max * 0.3)));
    const minLoss = Math.min(maxLoss, Math.max(40, Math.floor(activity.min * 0.15)));
    const amount = maxLoss > 0 ? randomInt(minLoss, maxLoss) : 0;
    return {
        type: 'loss',
        delta: -amount,
        message: randomChoice(LOSS_OUTCOMES),
        title: `❌ ${activity.name} - Thất bại`
    };
}

export default {
    data: new SlashCommandBuilder()
        .setName('work') // Đổi tên lệnh cho phù hợp hơn
        .setDescription('Thực hiện một công việc rủi ro để kiếm tiền nhanh'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);

            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Không thể tải dữ liệu kinh tế. Vui lòng thử lại sau.",
                    { userId, guildId }
                );
            }

            const lastSlut = userData.lastSlut || 0;

            if (now - lastSlut < SLUT_COOLDOWN) {
                const remainingTime = lastSlut + SLUT_COOLDOWN - now;
                throw createError(
                    "Slut cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn đã làm việc quá sức! Hãy nghỉ ngơi **${Math.ceil(remainingTime / 60000)}** phút nữa nhé.`,
                    { timeRemaining: remainingTime, cooldownType: 'slut' }
                );
            }

            const activity = randomChoice(SLUT_ACTIVITIES);
            const outcome = resolveOutcome(activity, userData.wallet || 0);

            userData.lastSlut = now;
            userData.totalSluts = (userData.totalSluts || 0) + 1;
            userData.totalSlutEarnings = (userData.totalSlutEarnings || 0) + Math.max(0, outcome.delta);
            userData.totalSlutLosses = (userData.totalSlutLosses || 0) + Math.max(0, -outcome.delta);

            if (outcome.type !== 'payout') {
                userData.failedSluts = (userData.failedSluts || 0) + 1;
            }

            userData.wallet = Math.max(0, (userData.wallet || 0) + outcome.delta);

            await setEconomyData(client, guildId, userId, userData);

            const amountLabel = `${outcome.delta >= 0 ? '+' : '-'}$${Math.abs(outcome.delta).toLocaleString()}`;
            const summaryLines = [
                `${outcome.message}`,
                `💸 **Kết quả:** ${amountLabel}`,
                `💳 **Số dư hiện tại:** $${userData.wallet.toLocaleString()}`,
                `📊 **Tổng số lần làm việc:** ${userData.totalSluts}`,
                `💵 **Tổng thu nhập:** $${(userData.totalSlutEarnings || 0).toLocaleString()}`,
                `🧾 **Tổng tổn thất:** $${(userData.totalSlutLosses || 0).toLocaleString()}`
            ];

            const embed = createEmbed({
                title: outcome.title,
                description: summaryLines.join('\n'),
                color: outcome.delta >= 0 ? 'success' : 'error',
                timestamp: true
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'work' })
};