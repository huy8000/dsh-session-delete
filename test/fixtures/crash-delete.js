import { harness } from '../helpers.js'
const h = await harness({ after() {} }, { existingHome: process.argv[2] })
// Exit after file/cache deletion but BEFORE Workspace cleanup. No real
// user home is selected: the parent passes its mkdtemp fixture explicitly.
h.workspace.detachSession = async () => { process.exit(23) }
const result = await h.service.remove('session-1')
console.error(result)
process.exit(3)
