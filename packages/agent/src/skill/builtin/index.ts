/**
 * 内置 Skills
 */

import { commitSkill } from "./commit"
import { prSkill } from "./pr"
import { reviewSkill } from "./review"
import { testSkill } from "./test"
import type { SkillDefinition } from "../types"

/**
 * 所有内置 Skills
 */
export const builtinSkills: SkillDefinition[] = [
  commitSkill,
  prSkill,
  reviewSkill,
  testSkill,
]

export { commitSkill, prSkill, reviewSkill, testSkill }
