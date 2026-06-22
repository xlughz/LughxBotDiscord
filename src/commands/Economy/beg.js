import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COOLDOWN = 30 * 60 * 1000;
const MIN_WIN = 50;
const MAX_WIN = 200;
const SUCCESS_CHANCE = 0.7;

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Đi ăn xin một số tiền nhỏ'),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            let userData = await getEconomyData(client, guildId, userId);
            
            if (!userData) {
                throw createError(
                    "Failed to load economy data",
                    ErrorTypes.DATABASE,
                    "Không thể tải dữ liệu kinh tế của bạn. Vui lòng thử lại sau.",
                    { userId, guildId }
                );
            }

            const lastBeg = userData.lastBeg || 0;
            const remainingTime = lastBeg + COOLDOWN - Date.now();

            if (remainingTime > 0) {
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);

                let timeMessage =
                    minutes > 0 ? `${minutes} phút` : `${seconds} giây`;

                throw createError(
                    "Beg cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn đã mệt vì đi ăn xin rồi! Hãy thử lại sau **${timeMessage}**.`,
                    { remainingTime, minutes, seconds, cooldownType: 'beg' }
                );
            }

            const success = Math.random() < SUCCESS_CHANCE;

            let replyEmbed;
            let newCash = userData.wallet;

            if (success) {
                const amountWon =
                    Math.floor(Math.random() * (MAX_WIN - MIN_WIN + 1)) + MIN_WIN;

                newCash += amountWon;

                const successMessages = [
                    `Một người tốt bụng đã bỏ **$${amountWon.toLocaleString()}** vào cốc của bạn.`,
                    `Bạn tìm thấy một chiếc ví không ai để ý! Bạn chộp lấy **$${amountWon.toLocaleString()}** rồi chạy mất.`,
                    `Ai đó đã thương hại và cho bạn **$${amountWon.toLocaleString()}**!`,
                    `Bạn tìm thấy **$${amountWon.toLocaleString()}** dưới một băng ghế công viên.`,
                ];

                replyEmbed = MessageTemplates.SUCCESS.DATA_UPDATED(
                    "ăn xin",
                    successMessages[
                        Math.floor(Math.random() * successMessages.length)
                    ]
                );
            } else {
                const failMessages = [
                    "Cảnh sát đuổi bạn đi. Bạn không nhận được gì cả.",
                    "Có người hét lên: 'Đi tìm việc mà làm đi!' rồi bỏ đi.",
                    "Một con sóc đã lấy mất đồng xu duy nhất mà bạn có.",
                    "Bạn định đi ăn xin, nhưng thấy quá xấu hổ nên đã bỏ cuộc.",
                ];

                replyEmbed = MessageTemplates.ERRORS.INSUFFICIENT_FUNDS(
                    "không được gì cả",
                    "Bạn đã thất bại trong việc xin tiền."
                );
                replyEmbed.data.description = failMessages[Math.floor(Math.random() * failMessages.length)];
            }

            userData.wallet = newCash;
            userData.lastBeg = Date.now();

            await setEconomyData(client, guildId, userId, userData);

            await InteractionHelper.safeEditReply(interaction, { embeds: [replyEmbed] });
    }, { command: 'beg' })
};