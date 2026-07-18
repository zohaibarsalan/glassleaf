import Foundation

struct ReaderChapter: Identifiable, Hashable, Sendable {
    let id: Int
    let title: String
    let pages: [String]
}

enum ReaderSample {
    static let chapters: [ReaderChapter] = [
        ReaderChapter(
            id: 0,
            title: "The Path In",
            pages: [
                "The gate had been left open just wide enough for a person to pass through. Beyond it, the path disappeared under hazel branches and the pale green light of early morning. Mara paused with one hand on the latch, listening for any sound that belonged to a house.\n\nThere was only the patient turning of leaves.",
                "She had carried the key for eleven years without knowing whether it opened anything. It was small, dark with age, and warm now from the pocket of her coat. The map mentioned no gate. The letter mentioned no garden. Still, both had led her here.",
                "A few steps in, the road behind her seemed to quiet. Gravel became moss. The hedge gave way to old pear trees trained along low brick walls, their branches tied with strips of linen that moved like little flags in the breeze.",
            ]
        ),
        ReaderChapter(
            id: 1,
            title: "Names for Green",
            pages: [
                "Her grandmother had names for every shade of green: rain green, bottle green, the silver green beneath an olive leaf. As a child, Mara believed these names were official and that adults who said only green had simply not been taught properly.",
                "The garden brought the old vocabulary back. New fern. Pond glass. Rosemary in shadow. She found herself naming each color under her breath, as if the words were stepping-stones and silence was deep water.",
                "At the center of the orchard stood a table laid for one. A cup, a folded napkin, and a shallow bowl of plums waited beneath the branches. Nothing was dusty. Nothing looked abandoned.",
            ]
        ),
        ReaderChapter(
            id: 2,
            title: "The Glasshouse",
            pages: [
                "The glasshouse leaned against the north wall, its panes clouded by years of mineral bloom. Inside, vines had climbed the iron ribs and made a second, living roof.",
                "Labels remained beside empty beds. Some were written in her grandmother’s narrow hand; others carried dates from before either of them was born. The newest label had no plant beside it. It held only Mara’s name.",
                "She touched the soil. It was cool and recently watered. Somewhere behind the leaves, a tap released one bright drop at a time into a metal basin.",
            ]
        ),
        ReaderChapter(
            id: 3,
            title: "What the Roots Kept",
            pages: [
                "Memory did not return as a picture. It arrived as texture: the rough twine around a bundle of herbs, the smooth wooden handle of a trowel, the sting of tomato leaves against her wrists.",
                "She remembered being small enough to stand beneath the table. Above her, voices moved in and out of laughter. Someone set down a bowl. Someone said that roots know the difference between leaving and being lost.",
                "Mara sat back on her heels. For the first time in years, the story she had been told about the family felt less like a locked door and more like a room with another exit.",
            ]
        ),
        ReaderChapter(
            id: 4,
            title: "A Room of Seeds",
            pages: [
                "The smallest room in the house held no furniture, only drawers. Hundreds of them covered the walls from floor to ceiling, each fitted with a brass pull and a handwritten card.",
                "Beans, marigolds, winter squash, foxglove. The names continued in several languages. A ledger on the windowsill recorded who had brought each seed and where it had traveled afterward.",
                "This was not a collection built by one person. It was a correspondence, carried in pockets and envelopes, renewed every time something was planted and shared.",
            ]
        ),
        ReaderChapter(
            id: 5,
            title: "Weather Turning",
            pages: [
                "Rain reached the roof at noon. It began with a soft testing sound, then settled into a steady rhythm that filled the rooms and blurred the orchard beyond the windows.",
                "Mara made tea on the old stove. While the kettle warmed, she read the letter again. This time the final sentence seemed different, though she knew the ink had not changed.",
                "Keep what can grow, it said. Return the rest to weather. She folded the page along its existing creases and watched the rain gather the garden into one dark, shining shape.",
            ]
        ),
    ]
}
