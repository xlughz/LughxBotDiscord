import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags } from 'discord.js';
import { shopItems } from '../../../config/shop/items.js';
import { getColor } from '../../../config/bot.js';
import { logger } from '../../../utils/logger.js';

export default {
    async execute(interaction, config, client) {
        try {
            const TARGET_MAX_PAGES = 3;
            const ITEMS_PER_PAGE = Math.max(1, Math.ceil(shopItems.length / TARGET_MAX_PAGES));
            const totalPages = Math.ceil(shopItems.length / ITEMS_PER_PAGE);
            let currentPage = 1;

            const createShopEmbed = (page) => {
                const startIndex = (page - 1) * ITEMS_PER_PAGE;
                const pageItems = shopItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Cửa Hàng')
                    .setColor(getColor('primary'))
                    .setDescription('Sử dụng `/buy item_id:<id> quantity:<số lượng>` để mua vật phẩm.');
                
                pageItems.forEach(item => {
                    embed.addFields({
                        name: `${item.name} (${item.id})`,
                        value: `🏷️ **Loại:** ${item.type}\n💚 **Giá:** $${item.price.toLocaleString()}\n${item.description}`,
                        inline: false,
                    });
                });
                embed.setFooter({ text: `Trang ${page}/${totalPages}` });
                return embed;
            };

            const createShopComponents = (page) => {
                if (totalPages <= 1) return [];
                return [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('shop_prev')
                            .setLabel('⬅️ Trang trước')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === 1),
                        new ButtonBuilder()
                            .setCustomId('shop_next')
                            .setLabel('Trang sau ➡️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(page === totalPages),
                    ),
                ];
            };

            const message = await interaction.reply({
                embeds: [createShopEmbed(currentPage)],
                components: createShopComponents(currentPage),
            });

            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000,
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.user.id !== interaction.user.id) {
                    await buttonInteraction.reply({ content: '❌ Bạn không thể sử dụng các nút này. Hãy chạy `/shop browse` để mở cửa hàng của riêng bạn.', flags: 64 });
                    return;
                }
                const { customId } = buttonInteraction;
                if (customId === 'shop_prev' || customId === 'shop_next') {
                    await buttonInteraction.deferUpdate();
                    if (customId === 'shop_prev' && currentPage > 1) currentPage--;
                    else if (customId === 'shop_next' && currentPage < totalPages) currentPage++;
                    await buttonInteraction.editReply({
                        embeds: [createShopEmbed(currentPage)],
                        components: createShopComponents(currentPage),
                    });
                }
            });

            collector.on('end', async () => {
                try {
                    const disabledComponents = createShopComponents(currentPage);
                    disabledComponents.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
                    await message.edit({ components: disabledComponents });
                } catch (_) {}
            });
        } catch (error) {
            logger.error('shop_browse error:', error);
            await interaction.reply({ content: '❌ Đã có lỗi xảy ra khi tải cửa hàng.', flags: MessageFlags.Ephemeral });
        }
    },
};