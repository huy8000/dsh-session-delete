import { Context } from '@deepseek-ai/cordis'
import * as Persistence from '@deepseek-ai/dsh-session-persistence-jsonl'
const ctx = new Context()
await ctx.plugin(Persistence, { root: process.argv[2], compression: 'none' })
const writer = await ctx.sessionPersistence.open(process.argv[3], 'write')
process.send('ready')
process.once('message', async () => {
  await writer.close()
  await ctx.fiber.dispose()
  process.disconnect()
})
