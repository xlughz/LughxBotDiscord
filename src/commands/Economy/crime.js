import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const CRIME_COOLDOWN = 60 * 60 * 1000;
const MIN_CRIME_AMOUNT = 100;
const MAX_CRIME_AMOUNT = 2000;
const FAILURE_RATE = 0.4;
const JAIL_TIME = 2 * 60 * 60 * 1000;

const CRIME_TYPES = [
    { name: "Móc túi (Pickpocketing)", value: "pickpocketing", min: 100, max: 500, risk: 0.3 },
    { name: "Đột nhập (Burglary)", value: "burglary", min: 300, max: 1000, risk: 0.4 },
    { name: "Cướp ngân hàng (Bank Heist)", value: "bank-heist", min: 1000, max: 5000, risk: 0.6 },
    { name: "Trộm tranh (Art Theft)", value: "art-theft", min: 2000, max: 10000, risk: 0.7 },
    { name: "Tội phạm mạng (Cybercrime)", value: "cybercrime", min: 5000, max: 20000, risk: 0.8 },
];

export default {
    data: new SlashCommandBuilder()
        .setName('crime')
        .setDescription('Thực hiện hành vi phạm tội để kiếm tiền (rất rủi ro)')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('Loại hành vi phạm tội muốn thực hiện')
                .setRequired(true)
                .addChoices(
                    ...CRIME_TYPES.map(c => ({ name: c.name, value: c.value }))
                )
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        await InteractionHelper.safeDefer(interaction);
            
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            const userData = await getEconomyData(client, guildId, userId);
            const lastCrime = userData.cooldowns?.crime || 0;
            const isJailed = userData.jailedUntil && userData.jailedUntil > now;

            if (isJailed) {
                const timeLeft = Math.ceil((userData.jailedUntil - now) / (1000 * 60));
                throw createError(
                    "User is in jail",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn đang bị giam giữ! Còn ${timeLeft} phút nữa mới được thả.`,
                    { jailTimeRemaining: userData.jailedUntil - now }
                );
            }

            if (now < lastCrime + CRIME_COOLDOWN) {
                const timeLeft = Math.ceil((lastCrime + CRIME_COOLDOWN - now) / (1000 * 60));
                throw createError(
                    "Crime cooldown active",
                    ErrorTypes.RATE_LIMIT,
                    `Bạn cần đợi ${timeLeft} phút nữa trước khi có thể phạm tội tiếp.`,
                    { remaining: lastCrime + CRIME_COOLDOWN - now, cooldownType: 'crime' }
                );
            }

            const crimeType = interaction.options.getString("type");
            const crime = CRIME_TYPES.find(c => c.value === crimeType);

            if (!crime) {
                throw createError(
                    "Invalid crime type",
                    ErrorTypes.VALIDATION,
                    "Vui lòng chọn một loại hành vi phạm tội hợp lệ.",
                    { crimeType }
                );
            }

            const isSuccess = Math.random() > crime.risk;
            const amountEarned = isSuccess
                ? Math.floor(Math.random() * (crime.max - crime.min + 1)) + crime.min
                : 0;

            userData.cooldowns = userData.cooldowns || {};
            userData.cooldowns.crime = now;

            if (isSuccess) {
                userData.wallet = (userData.wallet || 0) + amountEarned;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = successEmbed(
                    "Phạm Tội Thành Công!",
                    `Bạn đã thực hiện ${crime.name} trót lọt và kiếm được **${amountEarned.toLocaleString()}** xu!`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            } else {
                const fine = Math.floor(amountEarned * 0.2); // Phạt tiền dựa trên mức dự kiến
                userData.wallet = Math.max(0, (userData.wallet || 0) - fine);
                userData.jailedUntil = now + JAIL_TIME;
                
                await setEconomyData(client, guildId, userId, userData);
                
                const embed = errorEmbed(
                    "Phạm Tội Thất Bại!",
                    `Bạn đã bị bắt khi đang thực hiện ${crime.name} và bị tống vào tù! ` +
                    `Bạn bị phạt ${fine.toLocaleString()} xu và sẽ ở tù trong 2 giờ.`
                );
                
                await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }
    }, { command: 'crime' })
};