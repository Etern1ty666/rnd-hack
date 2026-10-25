import { useRef } from 'react'
import type { Evaluation } from '../lib/evaluate'
import { usePokes } from '../lib/usePokes'
import { Robot, type Mood } from './Robot'

interface Props {
  ev: Evaluation
  mood: Mood
  /** Курсор в строке ввода, пока она активна: туда Vi и смотрит. */
  gaze: React.RefObject<{ x: number; y: number; at: number } | null>
}

/**
 * Vi сидит на строке ввода, справа: смотрит на мышь, а пока человек пишет — на курсор в строке;
 * лампочка на антенне — цвет статуса бизнеса. Нажатие — толчок с той стороны, куда нажали;
 * толкают подряд — злится, затолкали — оглушён. Плавно водят курсором по голове — гладят.
 */
export function ViBot({ ev, mood, gaze }: Props) {
  const level = useRef(0)
  const { push, dizzy, pet, handlers } = usePokes()

  return (
    <div className={`vi-perch tone-${ev.status.tone}`}>
      <button className="vi-bot" {...handlers} aria-label="Vi">
        <Robot mood={dizzy ? 'dizzy' : mood} level={level} stand gaze={gaze} push={push} onPet={pet} />
      </button>
    </div>
  )
}
