# Logging tips

Every way of logging ends in the same place: a review where you check the food before it goes into
your diary. AI numbers are estimates. A few seconds of checking makes them much better.

## The + menu

Press **+** on Home. The menu has three groups at first:

- **Snap & scan:** Camera, Photo library, Barcode.
- **Describe:** Describe (type what you ate), Enter manually.
- **Reuse:** Recent, Often eaten, Saved, Copy a day.

With water or fasting tracking on, their rows sit under the food groups.

You can rename, reorder, hide or regroup the methods in Settings › App settings, under More, in
**Add menu**. Up to three groups; methods left outside a group sit straight on the menu, one tap
from +.

Food goes to the day picked on Home, at the current time of day. Pick an earlier day first to log
something you forgot, or change the date and time in the review.

## Photos

Use **Camera** or **Photo library**. One meal takes up to 10 photos, each up to 25 MB.

- Show the whole plate, in good light, from above or at a slight angle.
- Put something of known size in the picture, or say the size in the note.
- Use several photos for one meal when one angle hides things, such as a bowl's depth or a
  sandwich's filling.
- Add a **note** for what the photo cannot show: "about 200 g of rice", "cooked in butter", "no
  sugar in the tea".
- One meal per analysis. Log a second plate on its own.

**Plate built in steps** is for one plate photographed again each time something was added, for
example on a kitchen scale. Each food is worked out from what changed since the photo before, so
keep the photos in order and the scale's number readable. A finished meal seen from several sides
does not need it.

Some browsers cannot open HEIC photos, the usual format of iPhone cameras; Safari can. If a photo
is refused, pick a JPEG or PNG copy instead, or set the iPhone camera to "Most Compatible".

While the analysis runs you can press Cancel. If it fails, the message says why; Retry sends the
same photos and note again. An analysis waiting for your review is kept if the page reloads.

## Describe

Type what you ate and about how much: "a bowl of porridge with banana and a spoon of honey". The
more exact the amounts, the better the numbers. Name brands, cooking fat and sauces where they
matter.

Add what you paid if you like: "paneer roll, ₹120", "bagel and coffee, $6.50", "thali for 150".
The review then has the price filled in. An amount without a currency is in your own currency
(Settings › App settings › Units › Currency). A photo's note works the same way ("paid 5 dollars").
Platewise only takes a price you wrote: it never guesses one, so without a price in your words the
field stays empty.

## Barcode

Point the camera at the barcode, or type the digits printed under it and press **Look up**. If the
camera is blocked or cannot scan here, typing the digits always works.

Platewise looks the code up in Open Food Facts first. With a free FoodData Central key (Settings ›
AI providers, under Food databases), products Open Food Facts does not know are looked up there
too. Barcode lookups do not use your AI key.

If the product is not found, or has no nutrition values, press **Scan label** and photograph the
nutrition label. Your AI reads it, and Platewise remembers those values for that barcode: the next
scan of the same product finds them without asking the AI again. Delete the entries made from that
label to forget it.

## Enter manually

For food with known numbers: name, calories, protein, carbs, fat, an optional fibre, and the meal.
No AI is involved.

## The review

The review opens after every method. What to check:

- **Name.** Short and clear names make Recent and Often eaten easier to search.
- **Allergens.** When Personal info lists sensitivities, a line under the name warns about matches
  in the food's ingredients. "Can't assess" means there was not enough to go on, never that the
  food is safe.
- **Serving.** The amount and unit: grams, or the food's own units such as a slice or a cup. The
  "≈ g" line shows the weight a unit stands for. The calculator key lets you type sums such as
  `2 × 150`. Turn on **Grams first** in Settings › App settings if you weigh your food.
- **Nutrition.** Changing the amount scales every value. To type your own numbers, press **Edit
  nutrition**, change them, then **Done editing**; they still scale with the amount afterwards.
- **Micronutrients.** Sugars, fats, vitamins and minerals, where the source gave them. A dash means
  unknown, not zero.
- **Meal, date and time.** Until you pick a meal yourself, it follows the time you pick, using
  your meal times.
- **Price.** What the food cost, in the currency shown after the field. Type "120" or "4.50", or
  leave it empty for no price; a food without a price never counts as free. Changing the amount
  does not change the price.
- **Ingredients.** Split a meal into parts, or add a missing part (oil, a sauce, a drink) by photo,
  barcode, words, by hand or from your recent, frequent and saved foods. For a dish you cooked, add
  every ingredient, then set **Servings in recipe** so the amount shows one serving.
- **Fit check.** Shows your day with this meal added, before you log it. With a working AI key it
  adds a short suggestion. Nothing is logged there.
- **Product details.** For scanned products: package, scores, allergens and the label, if turned
  on in Settings › App settings, under More, in Product details.

Press **Log** when it looks right.

## After logging

- **Tap** an entry to edit it: every value, the photos, the meal, the price and the time. Write a
  note such as "large bowl" and press **Reprocess** to ask the AI again; nothing changes until you
  press Save. A price shows quietly on the entry's row, next to its time.
- **Swipe** an entry to the left to delete it. Platewise asks first.
- **Press and hold** an entry to start picking entries, then tap others and press **Combine** to
  join them into one. Every nutrient both entries have is added up.
- The **heart** keeps a copy in Saved, for quick logging later. The entry editor's Saved switch
  does the same.
- **Sort** switches the diary between By meal and Newest first.

## Reuse

- **Recent:** what you logged in the last 30 days.
- **Often eaten:** what you logged most in the last 90 days, with a count.
- **Saved:** your saved meals. Move them up or down, or remove them. Search works in all three
  lists.
- **Copy a day:** pick a day and copy all of its foods, or one meal, to the day picked on Home. The
  originals stay where they were.

Picking a food from Recent, Often eaten or Saved opens the review, so you can change the amount
(and the price) before you log it. A saved meal keeps its price. Copy a day logs the copies at
once.

## Prices and spending

Give a food a price in the review or the entry editor, or say it when you describe the meal. On a
day where some food has a price, Home shows what the day cost under the summary: "₹240 spent",
with "from 4 of 6 foods" when some foods have no price (they are left out, never counted as 0).
Prices in another currency are added up apart ("₹240 and $5 spent"), never converted. Tap the line
to open **Progress › Spending**; **Spending on Home** in All nutrients hides it.

Spending (also on the Progress tab, under the nutrition cards) shows:

- the last 7 or 30 days as bars, with their total; a day without any price shows a small circle
  instead of a bar,
- this month's total, how many days had a price, and the average over those days,
- each month, back to the first with a price (up to 12),
- the spend by meal, and the foods that cost the most.

Everything is in your currency; prices in another one are listed apart. Changing the currency in
Settings never changes a price you logged.

## Water and fasting

Turn them on in **Settings › Tracking & reminders**.

- **Water:** the + menu gets a Water row with your quick-add amounts (change them in Settings) and
  a custom amount of up to 5 000 ml. Home shows a water bar. Swipe a water row to delete it.
- **Fasting:** the + menu gets **Start fast**, with a goal in hours (16 by default). While a fast
  runs, food logging pauses: logging food offers **End fast and log**, or you can keep fasting.
  End or cancel the fast from the same menu row. Tap a fast in the diary to change its start or
  end.

## Getting closer numbers

- Packaged food: scan the barcode first. Label values beat an estimate from a photo.
- Weigh what you can, at least now and then, to learn what your usual portions weigh.
- Watch for hidden energy: cooking oil, butter, dressings, sugar in drinks, alcohol.
- Check the amount in the review more than the name. A wrong portion costs more than a wrong
  dish name.
- If an answer looks off, edit the values, or add a note and press Reprocess.
- Save meals you eat often, so you check them once and reuse them after.

For what each AI request costs, see [AI keys](ai-keys.md#what-it-costs). For what is sent with a
photo, see [Privacy and storage](privacy-and-storage.md#what-leaves-your-device-and-when).
