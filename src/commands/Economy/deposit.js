import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData, getMaxBankCapacity } from '../../utils/economy.js';
import { withErrorHandling, createError, ErrorTypes } from '../../utils/errorHandler.js';
import { MessageTemplates } from '../../utils/messageTemplates.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('deposit')
        .setDescription('Gửi tiền từ ví vào ngân hàng')
        .addStringOption(option =>
            option
                .setName('amount')
                .setDescription('Số tiền muốn gửi (số cụ thể hoặc "all")')
                .setRequired(true)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;
        
        const userId = interaction.user.id;
        const guildId = interaction.guildId;
        const amountInput = interaction.options.getString("amount");

        const userData = await getEconomyData(client, guildId, userId);
        
        if (!userData) {
            throw createError(
                "Failed to load economy data",
                ErrorTypes.DATABASE,
                "Không thể tải dữ liệu kinh tế của bạn. Vui lòng thử lại sau.",
                { userId, guildId }
            );
        }
        
        const maxBank = getMaxBankCapacity(userData);
        let depositAmount;

        if (amountInput.toLowerCase() === "all") {
            depositAmount = userData.wallet;
        } else {
            depositAmount = parseInt(amountInput);

            if (isNaN(depositAmount) || depositAmount <= 0) {
                throw createError(
                    "Invalid deposit amount",
                    ErrorTypes.VALIDATION,
                    `Vui lòng nhập một con số hợp lệ hoặc 'all'. Bạn đã nhập: \`${amountInput}\``,
                    { amountInput, userId }
                );
            }
        }

        if (depositAmount === 0) {
            throw createError(
                "Zero deposit amount",
                ErrorTypes.VALIDATION,
                "Bạn không có tiền mặt để gửi vào ngân hàng.",
                { userId, walletBalance: userData.wallet }
            );
        }

        if (depositAmount > userData.wallet) {
            depositAmount = userData.wallet;
            await interaction.followUp({
                embeds: [
                    MessageTemplates.ERRORS.INVALID_INPUT(
                        "số tiền gửi",
                        `Bạn cố gắng gửi nhiều hơn số tiền bạn có. Hệ thống sẽ gửi toàn bộ số tiền còn lại của bạn: **$${depositAmount.toLocaleString()}**`
                    )
                ],
                flags: ["Ephemeral"],
            });
        }

        const availableSpace = maxBank - userData.bank;

        if (availableSpace <= 0) {
            throw createError(
                "Bank is full",
                ErrorTypes.VALIDATION,
                `Ngân hàng của bạn đã đầy (Dung lượng tối đa: $${maxBank.toLocaleString()}). Hãy mua **Nâng cấp ngân hàng** để mở rộng hạn mức.`,
                { maxBank, currentBank: userData.bank, userId }
            );
        }

        if (depositAmount > availableSpace) {
            depositAmount = availableSpace;

            if (amountInput.toLowerCase() !== "all") {
                await interaction.followUp({
                    embeds: [
                        MessageTemplates.ERRORS.INVALID_INPUT(
                            "số tiền gửi",
                            `Ngân hàng của bạn chỉ còn trống **$${depositAmount.toLocaleString()}** (Tối đa: $${maxBank.toLocaleString()}). Số tiền còn lại vẫn nằm trong ví của bạn.`
                        )
                    ],
                    flags: ["Ephemeral"],
                });
            }
        }

        if (depositAmount === 0) {
            throw createError(
                "No space or cash for deposit",
                ErrorTypes.VALIDATION,
                "Số tiền bạn muốn gửi là 0 hoặc đã vượt quá dung lượng ngân hàng.",
                { depositAmount, availableSpace, walletBalance: userData.wallet }
            );
        }

        userData.wallet -= depositAmount;
        userData.bank += depositAmount;

        await setEconomyData(client, guildId, userId, userData);

        const embed = MessageTemplates.SUCCESS.DATA_UPDATED(
            "gửi tiền",
            `Bạn đã gửi thành công **$${depositAmount.toLocaleString()}** vào ngân hàng.`
        )
            .addFields(
                {
                    name: "💵 Số dư tiền mặt mới",
                    value: `$${userData.wallet.toLocaleString()}`,
                    inline: true,
                },
                {
                    name: "🏦 Số dư ngân hàng mới",
                    value: `$${userData.bank.toLocaleString()} / $${maxBank.toLocaleString()}`,
                    inline: true,
                },
            );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    }, { command: 'deposit' })
};