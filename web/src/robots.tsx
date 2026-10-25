import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './robots.css'
import { RobotGallery } from './components/RobotGallery'

// тестовая страница /robots.html: варианты внешности Vi рядом — выбрать, какие детали менять
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RobotGallery />
  </StrictMode>,
)
