# The Coach

The Coach is a chat about your own diary. It answers with your AI provider and your key, from the
data Platewise keeps on your device. It can read your log; it cannot change anything in it.

It needs a working AI provider (see [AI keys](ai-keys.md)). A question without a photo goes to
your text model if "Different model for text" is on, otherwise to your main provider. A question
with a photo always goes to the main provider.

## Asking

- Type a question and press Send. The reply appears when it is complete.
- Suggested questions match your goal (lose, keep or gain weight). Tapping one sends it as your
  question, with the photo you added if there is one; what you typed stays in the box.
- Press **+** in the message box to add one photo from the camera or your photo library, for
  example a menu or a meal you are about to eat. A photo sent without words asks the Coach to have
  a look at it.
- The Coach answers in the language you write in.
- Replies can hold headings, lists, bold text and links; links open in a new tab. The copy button
  copies a reply.

While a reply is on its way, Send and the suggested questions of that chat wait for it.

## Chats

You can keep several conversations with the Coach, each on its own subject. The name of the open
chat shows under the Coach heading.

- **New chat** (the **+** at the top) opens an empty chat with the suggested questions for your
  goal. It is kept once you send its first question, so an unused new chat never piles up.
- **Chats** (the list button at the top) shows every chat, the most recently used first: its name,
  when you last used it and the start of its last message. Tap a chat to open it. The open chat is
  marked.
- A chat is named after the start of its first question (up to 60 characters). **Rename** (the
  pencil next to a chat in Chats) gives it your own name, which then stays, whatever you ask in it
  later.
- **Delete** (the bin next to a chat in Chats) deletes that chat after asking first.
- The Coach tab opens on the chat you used most recently.

**A reply keeps going when you switch.** If you open another chat or start a new one while the
Coach is answering, the reply still arrives, in the chat you asked in. Chats shows "Replying…" on a
chat whose reply is on its way, and you can ask in another chat meanwhile; several chats can wait
for replies at the same time.

Each chat sends only its own messages to your AI provider. What the Coach knows about you (below)
is the same in every chat.

## What the Coach sees

When you press Send, Platewise takes a snapshot of your data. The whole answer works from that
snapshot, so food you log while a reply is on its way shows up on your next question.

**With every question**, the Coach gets a short summary:

- today's date and your time zone, so "yesterday" or "last week" work;
- your profile: sex, age, height, weight, activity level, goal and pace, goal weight, and body fat
  and its goal if you set them;
- how your energy numbers are worked out: your resting burn, your daily burn and your current
  targets;
- a weight forecast from the last 90 finished days, once there are at least two days with food
  logged and two weigh-ins in that time;
- how much data you have: counts of weigh-ins, body-fat readings, food entries and tracked fasts,
  and whether a fast is running;
- today so far: what you have eaten, what is left of your targets, and water against its goal if
  you track water;
- today's sugar against your Sugar limit, and how many of today's foods had a sugar figure (a food
  without one is never counted as 0 g);
- your notes for the AI, if you wrote any (Settings › AI providers).

**When it needs more**, the Coach asks Platewise for it. Platewise looks it up on your device and
sends back only what was asked for:

- how far back each kind of data goes;
- weigh-ins between two dates;
- body-fat readings between two dates;
- calories eaten per day between two dates;
- single food entries between two dates: date, name, calories, protein, carbs, fat, the meal, how
  it was logged, its weight or servings, and every nutrient on record;
- fasts tracked with the fasting timer: start, end, length, goal and whether it was reached.

Each answer Platewise sends back is cut to 60 000 characters at most, and a list of weigh-ins,
body-fat readings, food entries or fasts to 365 rows at most. When rows have to be left out, the
newest are kept. A question can take up to six requests to your provider while the Coach looks
things up. A question that needs more stops with a message; ask something narrower, such as a
shorter time span.

**From the chat itself**, the words of up to 19 earlier messages of the same chat go with each
question, so the Coach can follow the conversation. Photos from earlier messages are not sent
again, and nothing from your other chats is sent.

## What the Coach does not see or do

- your diary photos, notes on entries, ingredient parts or product details;
- your saved meals and your allergen sensitivities;
- water from days other than today;
- your settings and your API keys;
- anything outside Platewise.

It cannot log, edit or delete food, or change your goals or settings. If it says it did, it did not:
make the change yourself.

A day with nothing logged is unknown to the Coach, not a day of zero calories and not a fast. Only
fasts you tracked with the fasting timer count as fasts. Regular logging and weigh-ins give it
more to work with.

## When something goes wrong

A failed question stays in the chat with a short message. **Details** shows the provider's own
error text, with your keys removed. **Retry** asks the same question again.

If you set a standby for text or photos, it takes over once when the first provider fails, and
starts the question afresh.

## Your chat history

- Each chat keeps its newest 200 messages. Older ones are removed as new ones arrive. There is no
  limit on the number of chats.
- Photos you attached are kept as small copies in the chat.
- Your chats are part of your backups, with their names. They are not part of a diary export. A
  backup made with Platewise 1.3 or earlier restores as one chat; Platewise 1.3 restores a newer
  backup with all its messages in one conversation.
- Your conversation from before chats came (Platewise 1.3 and earlier) is your first chat, named
  after its first question, or "Earlier chat".
- **Delete chat** (the bin at the top) deletes the open chat, every message and photo in it, for
  good, after asking first, and opens a new chat. A reply that arrives after you deleted its chat
  is dropped.
- Settings › Your data › Erase everything deletes all your chats with everything else.

You can hide the Coach tab in Settings › App settings, under More, in Tab bar. Your chats stay
until you delete them.

The Coach's answers are estimates from your own log, not medical advice. For a health condition,
medication or a very low calorie target, ask a doctor or dietitian.
