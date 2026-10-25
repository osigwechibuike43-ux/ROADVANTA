import { Group } from 'three'
import type { VehicleSpec } from '../config/vehicles'
import { rt } from '../core/runtime'
import { createBody, type VehicleBody } from '../vehicles/physics'
import { makeRig, poseRig } from '../vehicles/factory'
import type { CarRig } from '../vehicles/models'
import { createAgent, type Agent, type AgentKind } from './agents'

/** Owns every non-player vehicle: creation, pooling of Three.js rigs, and removal. */
export class Fleet {
  readonly group = new Group()
  agents: Agent[] = []
  private pool = new Map<string, CarRig[]>()
  private nextId = 1000

  add(kind: AgentKind, spec: VehicleSpec, color: string, x: number, z: number, heading: number, rider?: string): Agent {
    const key = `${spec.id}:${spec.body}`
    let rig = this.pool.get(key)?.pop()
    if (!rig) {
      rig = makeRig(spec, color, rider)
      this.group.add(rig.root)
    }
    rig.root.visible = true
    if (spec.body !== 'police') rig.paintMats.forEach((m) => m.color.set(color))
    const body: VehicleBody = createBody(spec, x, z, heading)
    const agent = createAgent(this.nextId++, kind, body, rig, color)
    this.agents.push(agent)
    rt.bodies.push(body)
    poseRig(rig, body, 0, false)
    return agent
  }

  remove(a: Agent) {
    const i = this.agents.indexOf(a)
    if (i >= 0) this.agents.splice(i, 1)
    const j = rt.bodies.indexOf(a.body)
    if (j >= 0) rt.bodies.splice(j, 1)
    a.rig.root.visible = false
    const key = `${a.body.spec.id}:${a.body.spec.body}`
    const list = this.pool.get(key) ?? []
    list.push(a.rig)
    this.pool.set(key, list)
  }

  removeWhere(fn: (a: Agent) => boolean) {
    for (let i = this.agents.length - 1; i >= 0; i--) if (fn(this.agents[i])) this.remove(this.agents[i])
  }

  clear() {
    for (let i = this.agents.length - 1; i >= 0; i--) this.remove(this.agents[i])
  }

  dispose() {
    this.clear()
    this.pool.forEach((l) => l.forEach((r) => r.dispose()))
    this.pool.clear()
  }
}

export const fleet = new Fleet()
