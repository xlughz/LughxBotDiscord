import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const FISH_COOLDOWN = 45 * 60 * 1000; 
const BASE_MIN_REWARD = 300;
const BASE_MAX_REWARD = 900;
const FISHING_ROD_MULTIPLIER = 1.5;

const FISH_TYPES = [
    { name: 'Cá vược (Bass)', emoji: '🐟', rarity: 'common' },
    { name: 'Cá hồi (Salmon)', emoji: '🐟', rarity: 'common' },
    { name: 'Cá hồi nâu (Trout)', emoji: '🐟', rarity: 'common' },
    { name: 'Cá ngừ (Tuna)', emoji: '🐟', rarity: 'uncommon' },
    { name: 'Cá kiếm (Swordfish)', emoji: '🐟', rarity: 'uncommon' },
    { name: 'Bạch tuộc (Octopus)', emoji: '🐙', rarity: 'rare' },
    { name: 'Tôm hùm (Lobster)', emoji: '🦞', rarity: 'rare' },
    { name: 'Cá mập (Shark)', emoji: '🦈', rarity: 'epic' },
    { name: 'Cá voi (Whale)', emoji: '🐋', rarity: 'legendary' },
];

const CATCH_MESSAGES = [
    "Bạn thả cần câu xuống làn nước trong vắt...",
    "Bạn kiên nhẫn chờ đợi phao câu bập bềnh...",
    "Sau vài phút chờ đợi, bạn cảm thấy dây câu bị kéo mạnh...",
    "Mặt nước gợn sóng khi có thứ gì đó cắn câu...",
    "Bạn kéo cần câu lên với sự chính xác tuyệt vời...",
];

export default {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Đi câu cá để kiếm thêm thu nhập'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastFish = userData.lastFish || 0;
            const hasFishingRod = userData.inventory["fishing_rod"] || 0;

            if (now < lastFish + FISH_COOLDOWN) {
                const remaining = lastFish + FISH_COOLDOWN - now;
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60),
                );

                throw createError(
                    "Fishing cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn đã mệt và không thể đi câu được nữa. Hãy nghỉ ngơi **${hours} giờ ${minutes} phút** trước khi quay lại nhé.`,
                    { remaining, cooldownType: 'fish' }
                );
            }

            const rand = Math.random();
            let fishCaught;
            
            if (rand < 0.5) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'common')[Math.floor(Math.random() * 3)];
            } else if (rand < 0.75) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'uncommon')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.9) {
                fishCaught = FISH_TYPES.filter(f => f.rarity === 'rare')[Math.floor(Math.random() * 2)];
            } else if (rand < 0.98) {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'epic');
            } else {
                fishCaught = FISH_TYPES.find(f => f.rarity === 'legendary');
            }

            const baseEarned = Math.floor(
                Math.random() * (BASE_MAX_REWARD - BASE_MIN_REWARD + 1)
            ) + BASE_MIN_REWARD;

            let finalEarned = baseEarned;
            let multiplierMessage = "";

            if (hasFishingRod > 0) {
                finalEarned = Math.floor(baseEarned * FISHING_ROD_MULTIPLIER);
                multiplierMessage = `\n🎣 **Tiền thưởng từ cần câu: +50%**`;
            }

            const catchMessage = CATCH_MESSAGES[Math.floor(Math.random() * CATCH_MESSAGES.length)];

            userData.wallet += finalEarned;
            userData.lastFish = now;

            await setEconomyData(client, guildId, userId, userData);

            const rarityColors = {
                common: '#95A5A6',
                uncommon: '#2ECC71',
                rare: '#3498DB',
                epic: '#9B59B6',
                legendary: '#F1C40F'
            };

            const embed = createEmbed({
                title: '🎣 Câu Cá Thành Công!',
                description: `${catchMessage}\n\nBạn đã bắt được một con **${fishCaught.emoji} ${fishCaught.name}**! Bạn đã bán nó với giá **$${finalEarned.toLocaleString()}**!${multiplierMessage}`,
                color: rarityColors[fishCaught.rarity]
            })
                .addFields(
                    {
                        name: "💵 Số dư mới",
                        value: `$${userData.wallet.toLocaleString()}`,
                        inline: true,
                    },
                    {
                        name: "🐟 Độ hiếm",
                        value: fishCaught.rarity.charAt(0).toUpperCase() + fishCaught.rarity.slice(1),
                        inline: true,
                    }
                )
                .setFooter({ text: `Lần đi câu tiếp theo khả dụng sau 45 phút.` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'fish' })
};