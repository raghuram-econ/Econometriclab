import { useStore } from '../store/useStore';
import { NavTabId } from '../constants/navigation';
import { ModuleTab } from '../types';

export function useNavigation() {
  const { setActiveModule } = useStore();

  const navigateTo = (tab: NavTabId | ModuleTab) => {
    setActiveModule(tab as ModuleTab);
    // Scroll to top on navigation for better UX
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return { navigateTo };
}
