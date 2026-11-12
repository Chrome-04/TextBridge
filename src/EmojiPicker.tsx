import { useState } from 'react'

const groups = [
  {
    name: 'Popular',
    icon: '⭐',
    items:
      '😀 grinning|😊 smiling|😂 tears joy|❤️ red love heart|👍 thumbs up yes|🎉 party celebration|✨ sparkle|💡 idea light bulb|✅ check done|📌 pin|🙏 thanks pray|🚀 rocket launch|📚 books study|💻 laptop code computer|☕ coffee|🌱 seedling plant',
  },
  {
    name: 'Faces',
    icon: '😀',
    items:
      '😀 grinning|😃 happy|😄 laughing|😁 beaming|😆 laughing|😅 nervous|😂 tears joy|🤣 rolling laughing|😊 smiling|🙂 smile|😉 wink|😍 heart eyes|🥰 love|😘 kiss|😎 cool|🤓 nerd|🥳 party|🤔 thinking|🤫 quiet|🤗 hug|😴 sleepy|😭 crying|🥺 pleading|😤 frustrated|😱 shocked|😇 angel|🙃 upside down|🫠 melting|🫡 salute|🤯 mind blown',
  },
  {
    name: 'Gestures',
    icon: '👋',
    items:
      '👋 wave hello|👍 thumbs up yes|👎 thumbs down no|👏 clap|🙌 celebrate|🙏 thanks pray|🤝 handshake|💪 strong|✌️ peace|🤞 crossed fingers luck|👌 okay|🤟 love you|🫶 heart hands|👊 fist bump|👀 eyes look|🧠 brain|✍️ writing|🤙 call me|☝️ point up|👈 left|👉 right|👇 down|👆 up|🖐️ hand',
  },
  {
    name: 'Hearts',
    icon: '❤️',
    items:
      '❤️ red love heart|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|🤎 brown heart|🩷 pink heart|🩵 light blue heart|🩶 grey heart|💖 sparkling heart|💕 two hearts|💞 revolving hearts|💘 cupid|💝 gift heart|💔 broken heart|🔥 fire|✨ sparkle|💯 hundred|🎉 party celebration',
  },
  {
    name: 'Nature',
    icon: '🌱',
    items:
      '🌱 seedling plant|🌿 herb leaf|🍀 clover luck|🌻 sunflower|🌸 cherry blossom flower|🌹 rose|🌵 cactus|🌳 tree|🍁 maple leaf|🍂 autumn|🐶 dog|🐱 cat|🐻 bear|🐼 panda|🦊 fox|🐰 rabbit|🦋 butterfly|🐝 bee|🐢 turtle|🐬 dolphin|☀️ sun|🌙 moon night|⭐ star|🌈 rainbow|☁️ cloud|🌧️ rain|❄️ snow|🌊 wave',
  },
  {
    name: 'Food',
    icon: '🍕',
    items:
      '☕ coffee|🍵 tea|🧋 bubble tea|🥤 drink|💧 water|🍎 apple|🍌 banana|🍇 grapes|🍓 strawberry|🍉 watermelon|🥑 avocado|🍕 pizza|🍔 burger|🍟 fries|🍜 noodles|🍣 sushi|🍚 rice|🥗 salad|🍞 bread|🥐 croissant|🍰 cake|🎂 birthday cake|🍪 cookie|🍫 chocolate|🍦 ice cream|🥞 pancakes',
  },
  {
    name: 'Work',
    icon: '💻',
    items:
      '💻 laptop code computer|🖥️ desktop|📱 phone mobile|⌨️ keyboard|🖱️ mouse|📚 books study|📖 reading book|📝 note memo|📌 pin|📎 paperclip|📁 folder|📂 open folder|📅 calendar|📆 date|⏰ alarm time|⏳ hourglass wait|💡 idea light bulb|🔍 search|🛠️ tools|🔧 wrench fix|🎯 target goal|📊 chart|📈 growth|🧪 experiment test|🎓 graduation school|🎨 art colour|🎵 music|📷 camera|🔒 lock private|🔑 key',
  },
  {
    name: 'Travel',
    icon: '🚀',
    items:
      '🚀 rocket launch|✈️ airplane flight|🚗 car|🚲 bicycle|🚌 bus|🚆 train|🚢 ship|🛵 scooter|🏠 home|🏫 school|🏢 office|🏥 hospital|🏖️ beach|🏕️ camping|⛰️ mountain|🌍 globe world|🗺️ map|🧭 compass|🧳 luggage|🎒 backpack|🎮 game|🏆 trophy|🥇 medal|⚽ football|🏀 basketball|🏸 badminton',
  },
  {
    name: 'Symbols',
    icon: '✅',
    items:
      '✅ check done|✔️ check|❌ cross no|⚠️ warning|❗ important exclamation|❓ question|💬 chat comment|💭 thought|🔔 bell reminder|🔖 bookmark save|📍 location|🔗 link|➡️ right arrow|⬅️ left arrow|⬆️ up arrow|⬇️ down arrow|🔄 refresh repeat|➕ plus add|➖ minus|♻️ recycle|☑️ checkbox|🟢 green|🟡 yellow|🔴 red|🔵 blue|🟣 purple|⚪ white|⚫ black|1️⃣ one|2️⃣ two|3️⃣ three',
  },
].map((group) => ({
  ...group,
  items: group.items.split('|').map((entry) => {
    const split = entry.indexOf(' ')
    return { symbol: entry.slice(0, split), name: entry.slice(split + 1) }
  }),
}))

export default function EmojiPicker({
  onSelect,
  onClose,
  disabled,
}: {
  onSelect: (value: string) => void
  onClose: () => void
  disabled: boolean
}) {
  const [category, setCategory] = useState('Popular')
  const [search, setSearch] = useState('')
  const query = search.trim().toLocaleLowerCase()
  const items = query
    ? [
        ...new Map(
          groups
            .flatMap((group) => group.items)
            .map((item) => [item.symbol, item]),
        ).values(),
      ].filter((item) => `${item.symbol} ${item.name}`.includes(query))
    : groups.find((group) => group.name === category)!.items
  return (
    <div className="notes-emoji" role="group" aria-label="Choose an emoji">
      <div className="emoji-picker-head">
        <input
          type="search"
          aria-label="Search emojis"
          placeholder="Search emojis…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close emojis"
          title="Close emojis"
        >
          ×
        </button>
      </div>
      <div
        className="emoji-categories"
        role="group"
        aria-label="Emoji categories"
      >
        {groups.map((group) => (
          <button
            key={group.name}
            type="button"
            disabled={disabled}
            aria-label={group.name}
            title={group.name}
            aria-pressed={!query && category === group.name}
            onClick={() => {
              setCategory(group.name)
              setSearch('')
            }}
          >
            {group.icon}
          </button>
        ))}
      </div>
      <div className="emoji-grid">
        {items.map((item) => (
          <button
            key={item.symbol}
            type="button"
            disabled={disabled}
            aria-label={`Insert ${item.symbol}`}
            title={item.name}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(item.symbol)}
          >
            {item.symbol}
          </button>
        ))}
        {!items.length && <p className="size-hint">No matching emojis.</p>}
      </div>
    </div>
  )
}
