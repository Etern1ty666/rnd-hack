import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './robots.css'
import { RobotAnimations } from './components/RobotAnimations'
import { RobotGallery } from './components/RobotGallery'
import { VARIANTS } from './lib/robotVariants'

// тестовая страница /robots.html: варианты внешности Vi рядом — расставить по местам, какой лучше;
// ?v=N — все анимации одного варианта сразу
const num = Number(new URLSearchParams(location.search).get('v'))
const look = VARIANTS[num - 1]

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {look ? <RobotAnimations look={look} /> : <RobotGallery />}
  </StrictMode>,
)
