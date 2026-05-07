import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Check, Sparkles, Crown, Trophy, Target, Zap, Users, 
  ArrowRight, ArrowLeft, Star, AlertCircle, CheckCircle2,
  Award
} from 'lucide-react';
import { Button, Card } from './ios';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { supabase, DanceStyle, checkAchievementsSilently } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface CreateClanWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (clan: any) => void;
}

type WizardStep = 'requirements' | 'name' | 'description' | 'style' | 'preview' | 'success';

const MIN_SCORE_REQUIREMENT = 0; // Temporarily disabled for testing
const MIN_ATTEMPTS_REQUIREMENT = 0; // Temporarily disabled for testing

export function CreateClanWizard({ isOpen, onClose, onSuccess }: CreateClanWizardProps) {
  const { user, profile } = useAuth();
  const [currentStep, setCurrentStep] = useState<WizardStep>('requirements');
  const [clanName, setClanName] = useState('');
  const [clanDescription, setClanDescription] = useState('');
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [danceStyles, setDanceStyles] = useState<DanceStyle[]>([]);
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [checkingName, setCheckingName] = useState(false);
  const [creating, setCreating] = useState(false);
  const [requirements, setRequirements] = useState({
    score: 0,
    attempts: 0,
    meetsScore: false,
    meetsAttempts: false,
  });
  const [createdClan, setCreatedClan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentStep === 'requirements') {
      checkRequirements();
    }
    if (isOpen && currentStep === 'style') {
      fetchDanceStyles();
    }
  }, [isOpen, currentStep]);

  useEffect(() => {
    if (clanName.length >= 3 && currentStep === 'name') {
      checkClanName();
    } else {
      setNameAvailable(null);
    }
  }, [clanName, currentStep]);

  const checkRequirements = async () => {
    if (!user || !profile) return;

    // Get user's published attempts count
    const { data: attempts } = await supabase
      .from('attempts')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'published');

    const attemptsCount = attempts?.length || 0;
    const userScore = profile.score || 0;

    setRequirements({
      score: userScore,
      attempts: attemptsCount,
      meetsScore: true, // Requirements disabled for testing
      meetsAttempts: true, // Requirements disabled for testing
    });
  };

  const fetchDanceStyles = async () => {
    const { data } = await supabase
      .from('dance_styles')
      .select('*')
      .order('name');
    if (data) setDanceStyles(data);
  };

  const checkClanName = async () => {
    if (!clanName || clanName.length < 3) {
      setNameAvailable(null);
      return;
    }

    setCheckingName(true);
    try {
      const { data } = await supabase
        .from('clans')
        .select('id')
        .ilike('name', clanName.trim())
        .maybeSingle();
      
      setNameAvailable(!data);
    } catch (error) {
      setNameAvailable(null);
    } finally {
      setCheckingName(false);
    }
  };

  const handleNext = async () => {
    // Prevent double-clicks and ensure we can proceed
    if (creating || !canProceed()) {
      console.warn('handleNext blocked', { creating, canProceed: canProceed(), currentStep });
      return;
    }

    console.log('handleNext called', { currentStep, requirements, nameAvailable, clanName });
    
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {}

    if (currentStep === 'requirements') {
      if (requirements.meetsScore && requirements.meetsAttempts) {
        setCurrentStep('name');
      } else {
        console.warn('Requirements not met', requirements);
      }
    } else if (currentStep === 'name') {
      if (nameAvailable === true && clanName.trim().length >= 3) {
        setCurrentStep('description');
      } else {
        console.warn('Name validation failed', { nameAvailable, clanNameLength: clanName.trim().length });
      }
    } else if (currentStep === 'description') {
      setCurrentStep('style');
    } else if (currentStep === 'style') {
      setCurrentStep('preview');
    } else if (currentStep === 'preview') {
      console.log('Calling createClan from handleNext');
      await createClan();
    }
  };

  const handleBack = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {}
    
    if (currentStep === 'name') {
      setCurrentStep('requirements');
    } else if (currentStep === 'description') {
      setCurrentStep('name');
    } else if (currentStep === 'style') {
      setCurrentStep('description');
    } else if (currentStep === 'preview') {
      setCurrentStep('style');
    }
  };

  const handleClanCreated = async (clanData: any) => {
    setCreatedClan(clanData);
    
    // Auto-join created clan
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ clan_id: clanData.id })
      .eq('id', user!.id);

    if (updateError) {
      console.error('Error joining clan:', updateError);
      // Don't throw here - clan was created successfully, just log the join error
    }

    // Check for Clan Leader achievement (don't block on this)
    await checkAchievementsSilently(user!.id);

    // Success haptic
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch (e) {}

    setCurrentStep('success');
    
    // Auto-close after celebration
    setTimeout(() => {
      onSuccess(clanData);
      handleClose();
    }, 3000);
  };

  const createClan = async () => {
    if (!user || !clanName.trim()) {
      setError('Please provide a clan name');
      return;
    }

    setCreating(true);
    setError(null);
    
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {}

    try {
      // Build insert data - creator_id may not exist in all schemas
      const insertData: any = {
        name: clanName.trim(),
        description: clanDescription.trim() || 'A dance crew ready to move different',
      };

      // Only include creator_id if the column exists (it was added in a later migration)
      // We'll try to insert it, and if it fails, we'll retry without it
      const { data, error: insertError } = await supabase
        .from('clans')
        .insert({
          ...insertData,
          creator_id: user.id,
        })
        .select()
        .maybeSingle();

      // If creator_id column doesn't exist, retry without it
      if (insertError && insertError.message?.includes('creator_id')) {
        console.warn('creator_id column not found, creating clan without it');
        const { data: retryData, error: retryError } = await supabase
          .from('clans')
          .insert(insertData)
          .select()
          .maybeSingle();
        
        if (retryError) throw retryError;
        if (!retryData) throw new Error('Clan was created but no data was returned.');
        
        // Success path for retry
        await handleClanCreated(retryData);
        return;
      }

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        throw new Error(insertError.message || 'Failed to create clan. Please try again.');
      }

      if (!data) {
        throw new Error('Clan was created but no data was returned. Please refresh and try again.');
      }

      // Success path for normal insert
      await handleClanCreated(data);
    } catch (error: any) {
      console.error('Error creating clan:', error);
      setError(error?.message || 'Failed to create clan. Please check your connection and try again.');
      setCreating(false);
      
      // Error haptic
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch (e) {}
    }
  };

  const handleClose = () => {
    setCurrentStep('requirements');
    setClanName('');
    setClanDescription('');
    setSelectedStyleId(null);
    setNameAvailable(null);
    setCreatedClan(null);
    setError(null);
    onClose();
  };

  const canProceed = () => {
    if (creating) return false; // Never allow proceeding while creating
    
    if (currentStep === 'requirements') {
      return true; // Requirements check disabled for testing - can always proceed
    } else if (currentStep === 'name') {
      return nameAvailable === true && clanName.trim().length >= 3;
    } else if (currentStep === 'description') {
      return true; // Description is optional
    } else if (currentStep === 'style') {
      return true; // Style is optional
    } else if (currentStep === 'preview') {
      return true; // Can always proceed to create clan
    }
    return false;
  };

  const getStepProgress = () => {
    const steps = ['requirements', 'name', 'description', 'style', 'preview', 'success'];
    const currentIndex = steps.indexOf(currentStep);
    return ((currentIndex + 1) / steps.length) * 100;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        onClick={currentStep !== 'success' ? handleClose : undefined}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <Card variant="elevated" className="relative overflow-hidden">
            {/* Progress Bar */}
            {currentStep !== 'success' && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-groovely-dark-border">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${getStepProgress()}%` }}
                  className="h-full bg-gradient-to-r from-groovely-peach-500 via-groovely-pink-500 to-groovely-purple-500"
                />
              </div>
            )}

            {/* Close Button */}
            {currentStep !== 'success' && (
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 z-10 p-2 hover:bg-groovely-dark-surface rounded-lg transition-colors"
              >
                <X size={20} className="text-groovely-dark-text-secondary" />
              </button>
            )}

            <div className="p-8">
              {/* Requirements Step */}
              {currentStep === 'requirements' && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, delay: 0.2 }}
                      className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-groovely-peach-500/30"
                    >
                      <Crown size={40} className="text-white" />
                    </motion.div>
                    <h2 className="text-3xl font-bold text-white mb-2 font-heading">
                      Become a Clan Leader
                    </h2>
                    <p className="text-groovely-dark-text-secondary">
                      Unlock the power to create and lead your own dance crew
                    </p>
                  </div>

                  <div className="space-y-4">
                    <Card variant="outline" className={`p-4 border-2 transition-all ${
                      requirements.meetsScore 
                        ? 'border-green-500/50 bg-green-500/10' 
                        : 'border-groovely-dark-border'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          requirements.meetsScore 
                            ? 'bg-gradient-to-br from-green-500 to-emerald-500' 
                            : 'bg-groovely-dark-surface'
                        }`}>
                          {requirements.meetsScore ? (
                            <CheckCircle2 size={24} className="text-white" />
                          ) : (
                            <Target size={24} className="text-groovely-dark-text-tertiary" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white mb-1 font-heading">
                            Minimum Score: {MIN_SCORE_REQUIREMENT} Points
                          </h3>
                          <p className="text-sm text-groovely-dark-text-secondary mb-2">
                            Your current score: <span className={`font-semibold ${
                              requirements.meetsScore ? 'text-green-400' : 'text-groovely-peach-400'
                            }`}>{requirements.score.toLocaleString()}</span>
                          </p>
                          {!requirements.meetsScore && (
                            <p className="text-xs text-groovely-dark-text-tertiary">
                              Need {MIN_SCORE_REQUIREMENT - requirements.score} more points. Keep practicing!
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>

                    <Card variant="outline" className={`p-4 border-2 transition-all ${
                      requirements.meetsAttempts 
                        ? 'border-green-500/50 bg-green-500/10' 
                        : 'border-groovely-dark-border'
                    }`}>
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          requirements.meetsAttempts 
                            ? 'bg-gradient-to-br from-green-500 to-emerald-500' 
                            : 'bg-groovely-dark-surface'
                        }`}>
                          {requirements.meetsAttempts ? (
                            <CheckCircle2 size={24} className="text-white" />
                          ) : (
                            <Trophy size={24} className="text-groovely-dark-text-tertiary" />
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white mb-1 font-heading">
                            Minimum {MIN_ATTEMPTS_REQUIREMENT} Published Attempts
                          </h3>
                          <p className="text-sm text-groovely-dark-text-secondary mb-2">
                            Your published attempts: <span className={`font-semibold ${
                              requirements.meetsAttempts ? 'text-green-400' : 'text-groovely-peach-400'
                            }`}>{requirements.attempts}</span>
                          </p>
                          {!requirements.meetsAttempts && (
                            <p className="text-xs text-groovely-dark-text-tertiary">
                              Need {MIN_ATTEMPTS_REQUIREMENT - requirements.attempts} more published attempts.
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>

                  {requirements.meetsScore && requirements.meetsAttempts && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-gradient-to-r from-groovely-peach-500/20 to-groovely-purple-500/20 border border-groovely-peach-500/30 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <Sparkles size={24} className="text-groovely-peach-400" />
                        <div>
                          <p className="text-white font-semibold">You're Ready!</p>
                          <p className="text-sm text-groovely-dark-text-secondary">
                            All requirements met. Let's create your clan!
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Name Step */}
              {currentStep === 'name' && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                      className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-groovely-peach-500 to-groovely-pink-500 rounded-xl flex items-center justify-center"
                    >
                      <Sparkles size={32} className="text-white" />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-white mb-2 font-heading">
                      Name Your Clan
                    </h2>
                    <p className="text-groovely-dark-text-secondary">
                      Choose a unique name that represents your crew
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-groovely-dark-text-secondary mb-2">
                      Clan Name <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={clanName}
                        onChange={(e) => {
                          setClanName(e.target.value);
                          setNameAvailable(null);
                        }}
                        placeholder="e.g., Groove Masters, Dance Dynasty..."
                        className={`w-full px-4 py-3 bg-groovely-dark-surface border rounded-xl text-base text-white placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-transparent transition-all ${
                          nameAvailable === false
                            ? 'border-red-500/50'
                            : nameAvailable === true
                            ? 'border-green-500/50'
                            : 'border-groovely-dark-border'
                        }`}
                        maxLength={30}
                        autoFocus
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <AnimatePresence mode="wait">
                          {checkingName && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                            >
                              <div className="w-5 h-5 border-2 border-groovely-peach-500 border-t-transparent rounded-full animate-spin" />
                            </motion.div>
                          )}
                          {!checkingName && nameAvailable === true && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                            >
                              <CheckCircle2 size={20} className="text-green-400" />
                            </motion.div>
                          )}
                          {!checkingName && nameAvailable === false && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                            >
                              <AlertCircle size={20} className="text-red-400" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    {clanName && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className={`text-xs mt-2 ${
                          nameAvailable === false
                            ? 'text-red-400'
                            : nameAvailable === true
                            ? 'text-green-400'
                            : clanName.length < 3
                            ? 'text-groovely-dark-text-tertiary'
                            : 'text-groovely-dark-text-secondary'
                        }`}
                      >
                        {clanName.length < 3
                          ? 'At least 3 characters required'
                          : nameAvailable === false
                          ? 'This name is already taken'
                          : nameAvailable === true
                          ? '✓ Name available!'
                          : 'Checking availability...'}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Description Step */}
              {currentStep === 'description' && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                      className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-groovely-pink-500 to-groovely-purple-500 rounded-xl flex items-center justify-center"
                    >
                      <Target size={32} className="text-white" />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-white mb-2 font-heading">
                      Describe Your Clan
                    </h2>
                    <p className="text-groovely-dark-text-secondary">
                      Tell others what makes your crew special
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-groovely-dark-text-secondary mb-2">
                      Description <span className="text-groovely-dark-text-tertiary">(optional)</span>
                    </label>
                    <textarea
                      value={clanDescription}
                      onChange={(e) => setClanDescription(e.target.value)}
                      placeholder="What's your clan's mission? What dance styles do you focus on? What makes you unique?"
                      rows={5}
                      className="w-full px-4 py-3 bg-groovely-dark-surface border border-groovely-dark-border rounded-xl text-base text-white placeholder-groovely-dark-text-tertiary focus:ring-2 focus:ring-groovely-peach-500 focus:border-transparent transition-all resize-none"
                      maxLength={200}
                    />
                    <p className="text-xs text-groovely-dark-text-tertiary mt-2 text-right">
                      {clanDescription.length}/200
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Style Step */}
              {currentStep === 'style' && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                      className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-xl flex items-center justify-center"
                    >
                      <Zap size={32} className="text-white" />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-white mb-2 font-heading">
                      Choose Your Style
                    </h2>
                    <p className="text-groovely-dark-text-secondary">
                      Select a primary dance style (optional)
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                    {danceStyles.map((style) => {
                      const isSelected = selectedStyleId === style.id;
                      return (
                        <motion.button
                          key={style.id}
                          onClick={() => {
                            try {
                              Haptics.impact({ style: ImpactStyle.Light });
                            } catch (e) {}
                            setSelectedStyleId(isSelected ? null : style.id);
                          }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className={`p-4 rounded-xl border-2 transition-all text-left ${
                            isSelected
                              ? 'border-groovely-peach-500 bg-groovely-peach-500/10 shadow-lg shadow-groovely-peach-500/20'
                              : 'border-groovely-dark-border bg-groovely-dark-surface hover:border-groovely-peach-500/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold text-white mb-1">
                                {style.name}
                              </div>
                              {style.description && (
                                <div className="text-xs text-groovely-dark-text-secondary line-clamp-2">
                                  {style.description}
                                </div>
                              )}
                            </div>
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-6 h-6 bg-gradient-to-br from-groovely-peach-500 to-groovely-purple-500 rounded-full flex items-center justify-center"
                              >
                                <Check size={14} className="text-white" />
                              </motion.div>
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Preview Step */}
              {currentStep === 'preview' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-6"
                >
                  <div className="text-center mb-6">
                    <motion.div
                      initial={{ scale: 0, rotate: 180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                      className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-groovely-peach-500 via-groovely-pink-500 to-groovely-purple-500 rounded-xl flex items-center justify-center"
                    >
                      <Star size={32} className="text-white" />
                    </motion.div>
                    <h2 className="text-2xl font-bold text-white mb-2 font-heading">
                      Preview Your Clan
                    </h2>
                    <p className="text-groovely-dark-text-secondary">
                      Review before creating
                    </p>
                  </div>

                  <Card variant="elevated" className="bg-gradient-to-br from-groovely-dark-card to-groovely-dark-surface border-groovely-dark-border">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-groovely-purple-500 to-groovely-peach-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <Users size={32} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-white mb-1 font-heading">
                          {clanName}
                        </h3>
                        <p className="text-sm text-groovely-dark-text-secondary">
                          {clanDescription || 'A dance crew ready to move different'}
                        </p>
                      </div>
                    </div>
                    {selectedStyleId && (
                      <div className="mt-4 pt-4 border-t border-groovely-dark-border">
                        <p className="text-xs text-groovely-dark-text-tertiary mb-2">Primary Style:</p>
                        <p className="text-sm text-groovely-peach-400 font-semibold">
                          {danceStyles.find(s => s.id === selectedStyleId)?.name}
                        </p>
                      </div>
                    )}
                  </Card>

                  <div className="p-4 bg-gradient-to-r from-groovely-peach-500/10 to-groovely-purple-500/10 border border-groovely-peach-500/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Award size={20} className="text-groovely-peach-400" />
                      <div>
                        <p className="text-sm font-semibold text-white">Achievement Unlock</p>
                        <p className="text-xs text-groovely-dark-text-secondary">
                          Creating a clan unlocks the "Clan Leader" achievement!
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl"
                    >
                      <div className="flex items-start gap-3">
                        <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-red-400 mb-1">Error</p>
                          <p className="text-xs text-red-300">{error}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Success Step */}
              {currentStep === 'success' && createdClan && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center space-y-6 py-8"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-24 h-24 mx-auto bg-gradient-to-br from-groovely-peach-500 via-groovely-pink-500 to-groovely-purple-500 rounded-full flex items-center justify-center shadow-2xl shadow-groovely-peach-500/50"
                  >
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Crown size={48} className="text-white" />
                    </motion.div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <h2 className="text-3xl font-bold text-white mb-2 font-heading">
                      Clan Created!
                    </h2>
                    <p className="text-lg text-groovely-peach-400 font-semibold mb-4">
                      {createdClan.name}
                    </p>
                    <p className="text-groovely-dark-text-secondary">
                      You're now the leader of your own dance crew!
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="p-4 bg-gradient-to-r from-groovely-peach-500/20 to-groovely-purple-500/20 border border-groovely-peach-500/30 rounded-xl"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Award size={20} className="text-groovely-peach-400" />
                      <p className="text-sm font-semibold text-white">
                        Achievement Unlocked: Clan Leader
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="flex items-center justify-center gap-2 text-groovely-dark-text-tertiary text-sm"
                  >
                    <Sparkles size={16} />
                    <span>Redirecting to your clan...</span>
                  </motion.div>
                </motion.div>
              )}

              {/* Navigation Buttons */}
              {currentStep !== 'success' && (
                <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t border-groovely-dark-border">
                  {currentStep !== 'requirements' ? (
                    <Button
                      onClick={handleBack}
                      variant="ghost"
                      className="!bg-groovely-dark-surface"
                    >
                      <ArrowLeft size={18} className="mr-2" />
                      Back
                    </Button>
                  ) : (
                    <div />
                  )}
                  <Button
                    onClick={() => {
                      console.log('Button clicked', { currentStep, canProceed: canProceed(), creating });
                      if (!canProceed() || creating) {
                        console.warn('Button disabled or creating', { canProceed: canProceed(), creating });
                        return;
                      }
                      handleNext().catch((error) => {
                        console.error('Error in handleNext:', error);
                        setError(error?.message || 'An error occurred. Please try again.');
                      });
                    }}
                    disabled={!canProceed() || creating}
                    variant="primary"
                    className="!bg-gradient-to-r !from-groovely-peach-500 !to-groovely-purple-500 hover:!shadow-lg hover:!shadow-groovely-peach-500/30 disabled:!opacity-50 flex-1 max-w-xs ml-auto"
                  >
                    {creating ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Creating...
                      </>
                    ) : currentStep === 'preview' ? (
                      <>
                        <Crown size={18} className="mr-2" />
                        Create Clan
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight size={18} className="ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

