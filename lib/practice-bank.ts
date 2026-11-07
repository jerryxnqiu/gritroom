/** Checked original starter items keyed to thinking blueprints. Not official sample items. */

export type PracticeOptionKey = "A" | "B" | "C" | "D";

export type BankQuestion = {
  id: string;
  blueprintId: string;
  blueprintVersion: number;
  prompt: string;
  options: Record<PracticeOptionKey, string>;
  correctOption: PracticeOptionKey;
};

export const PRACTICE_BANK: BankQuestion[] = [
  {
    id: "q-necessary-vs-sufficient",
    blueprintId: "necessary-vs-sufficient",
    blueprintVersion: 1,
    prompt:
      "A library stamp is issued only if a book has been returned on time. Which statement must be true?",
    options: {
      A: "Every book returned on time receives a stamp.",
      B: "If a book has a stamp, it was returned on time.",
      C: "Books without a stamp were returned late.",
      D: "A late return can still receive a stamp.",
    },
    correctOption: "B",
  },
  {
    id: "q-overlap-in-counts",
    blueprintId: "overlap-in-counts",
    blueprintVersion: 1,
    prompt:
      "In a class of 20 children, 12 play chess and 10 play checkers. Which claim is not forced by these numbers alone?",
    options: {
      A: "At least 2 children play both games.",
      B: "At most 10 children play only checkers.",
      C: "Exactly 22 children play a game.",
      D: "It is possible that every checkers player also plays chess.",
    },
    correctOption: "C",
  },
  {
    id: "q-unique-identification",
    blueprintId: "unique-identification",
    blueprintVersion: 1,
    prompt:
      "A lost bag is blue, has a name tag beginning with L, and contains a maths workbook. Two bags match the colour and workbook. What else must be true to identify one bag for certain?",
    options: {
      A: "The owner likes blue bags.",
      B: "Only one of the matching bags has a name tag beginning with L.",
      C: "Both bags are the same size.",
      D: "The workbook has a school stamp.",
    },
    correctOption: "B",
  },
  {
    id: "q-condition-chain",
    blueprintId: "condition-chain",
    blueprintVersion: 1,
    prompt:
      "If Maya finishes her reading log, she may join art club. If she joins art club, she stays after school. Maya did not stay after school. What follows?",
    options: {
      A: "Maya finished her reading log.",
      B: "Maya joined art club.",
      C: "Maya did not finish her reading log.",
      D: "Maya stayed after school for another reason.",
    },
    correctOption: "C",
  },
  {
    id: "q-direct-support",
    blueprintId: "direct-support",
    blueprintVersion: 1,
    prompt:
      "Claim: The classroom plants grew faster this month because they were moved closer to the window. Which fact most strongly supports the claim?",
    options: {
      A: "The plants are popular with the class.",
      B: "Plants of the same type near the window grew faster than those left farther away.",
      C: "The classroom has several windows.",
      D: "The teacher waters the plants twice a week.",
    },
    correctOption: "B",
  },
  {
    id: "q-specific-counterevidence",
    blueprintId: "specific-counterevidence",
    blueprintVersion: 1,
    prompt:
      "Argument: Our team scored more goals after switching to orange shirts, so orange shirts improve scoring. Which fact most weakens the argument?",
    options: {
      A: "Orange is a bright colour.",
      B: "The team also began training twice as often in the same week.",
      C: "Some fans prefer blue shirts.",
      D: "The next match is on Saturday.",
    },
    correctOption: "B",
  },
  {
    id: "q-ordered-constraints",
    blueprintId: "ordered-constraints",
    blueprintVersion: 1,
    prompt:
      "Four books stand in a row: W, X, Y and Z. W is immediately left of Y. Z is at one end. X is not next to Z. Which order is possible?",
    options: {
      A: "Z, X, W, Y",
      B: "W, Y, X, Z",
      C: "X, W, Y, Z",
      D: "Z, W, X, Y",
    },
    correctOption: "C",
  },
  {
    id: "q-fit-pieces",
    blueprintId: "fit-pieces",
    blueprintVersion: 1,
    prompt:
      "A square tray is divided into four equal smaller squares. You have two L-shaped tiles that each cover three of the small squares. How can they cover the tray without overlap?",
    options: {
      A: "They cannot cover the tray, because 3 + 3 is more than 4.",
      B: "Place them so each covers three small squares; together they need six small squares.",
      C: "They cannot cover only four small squares without overlap or going outside.",
      D: "Rotate one tile and stack it on the other.",
    },
    correctOption: "C",
  },
  {
    id: "q-track-rotation",
    blueprintId: "track-rotation",
    blueprintVersion: 1,
    prompt:
      "A triangular flag has a star painted near its top point. The flag is rotated 180 degrees in the plane. Where is the star now, relative to the flag’s new position?",
    options: {
      A: "Near the same top point as before, because the star does not move.",
      B: "Near the point that was previously at the bottom.",
      C: "In the centre of the flag.",
      D: "Off the flag.",
    },
    correctOption: "B",
  },
  {
    id: "q-missing-information",
    blueprintId: "missing-information",
    blueprintVersion: 1,
    prompt:
      "Rule: A parcel is express only if it weighs under 2 kg and is marked fragile. The table shows weight for two parcels but leaves the fragile mark blank for both. Which question must you answer to test the rule for parcel 1?",
    options: {
      A: "Who packed parcel 1?",
      B: "Is parcel 1 marked fragile?",
      C: "What colour is the parcel label?",
      D: "Was parcel 2 delivered yesterday?",
    },
    correctOption: "B",
  },
  {
    id: "q-compare-differences",
    blueprintId: "compare-differences",
    blueprintVersion: 1,
    prompt:
      "A table shows morning and afternoon temperatures for three towns: A 12→18, B 15→19, C 10→17. Which town had the largest rise?",
    options: {
      A: "Town A",
      B: "Town B",
      C: "Town C",
      D: "Towns A and C rose by the same amount",
    },
    correctOption: "C",
  },
  {
    id: "q-structure-then-calculate",
    blueprintId: "structure-then-calculate",
    blueprintVersion: 1,
    prompt:
      "A relay uses three equal legs. The team’s total time is 6 minutes. The first leg takes 30 seconds less than each of the other two, which are equal. How long is the first leg?",
    options: {
      A: "1 minute 40 seconds",
      B: "1 minute 50 seconds",
      C: "2 minutes",
      D: "2 minutes 10 seconds",
    },
    correctOption: "A",
  },
];

export function questionsForBlueprints(blueprintIds: Iterable<string>) {
  const allowed = new Set(blueprintIds);
  return PRACTICE_BANK.filter((question) => allowed.has(question.blueprintId));
}
