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

While a reply is on its way, Send and the suggested questions wait for it.

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

**From the chat itself**, the words of up to 19 earlier messages go with each question, so the
Coach can follow the conversation. Photos from earlier messages are not sent again.

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

- The chat keeps the newest 200 messages. Older ones are removed as new ones arrive.
- Photos you attached are kept as small copies in the chat.
- The chat is part of your backups. It is not part of a diary export.
- **Clear chat** (the bin at the top) deletes every message and photo in the chat for good. A reply
  that arrives after you cleared the chat is dropped.

You can hide the Coach tab in Settings › App settings, under More, in Tab bar. Your chat stays
until you clear it.

The Coach's answers are estimates from your own log, not medical advice. For a health condition,
medication or a very low calorie target, ask a doctor or dietitian.
