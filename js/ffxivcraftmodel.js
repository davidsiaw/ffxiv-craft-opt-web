//require('./String.js');
/* Adding new actions search for STEP_##
    * Add action to AllActions object STEP_01
    * Add action effect to ApplySpecialActionEffects STEP_02
    * Add action counter to UpdateEffectCounters STEP_03
*/

/* ToDo
    * Implement Heavensward actions
 */

function LogOutput() {
  this.log = '';
}

LogOutput.prototype.write = function (s) {
  this.log += s;
};

LogOutput.prototype.clear = function () {
  this.log = '';
};

function Logger(logOutput) {
    this.logOutput = logOutput;
}

Logger.prototype.log = function(myString) {
    var args = Array.prototype.slice.call(arguments, 1);
    var msg = String.prototype.sprintf.apply(myString, args);
    if (this.logOutput !== undefined && this.logOutput !== null) {
        this.logOutput.write(msg + '\n');
    }
    else {
        console.log(msg);
    }
};

function Crafter(cls, level, craftsmanship, control, craftPoints, specialist, actions) {
    this.cls = cls;
    this.craftsmanship = craftsmanship;
    this.control = control;
    this.craftPoints = craftPoints;
    this.level = level;
    this.specialist = specialist;
    if (actions === null) {
        this.actions = [];
    }
    else {
        this.actions = actions;
    }
}

function Recipe(baseLevel, level, difficulty, durability, startQuality, maxQuality, sctrl, scraft) {
    this.baseLevel = baseLevel;
    this.level = level;
    this.difficulty = difficulty;
    this.durability = durability;
    this.startQuality = startQuality;
    this.maxQuality = maxQuality;
    this.sctrl = sctrl;
    this.scraft = scraft;
}

function Synth(crafter, recipe, maxTrickUses, reliabilityIndex, useConditions, maxLength) {
    this.crafter = crafter;
    this.recipe = recipe;
    this.maxTrickUses = maxTrickUses;
    this.useConditions = useConditions;
    this.reliabilityIndex = reliabilityIndex;
    this.maxLength = maxLength;
}

Synth.prototype.calculateBaseProgressIncrease = function (levelDifference, craftsmanship, crafterLevel, recipeLevel, scraft) {
    var p1 = 0.21 * craftsmanship + 2;
    var p2 = p1 * (10000 + craftsmanship) / (10000 + scraft);
    var p3 = p2 * getLevelDifferenceFactor('craftsmanship', levelDifference);

    return Math.floor(p3);
};

Synth.prototype.calculateBaseQualityIncrease = function (levelDifference, control, crafterLevel, recipeLevel, sctrl) {
    var q1 = 0.35 * control + 35;
    var q2 = q1 * (10000 + control) / (10000 + sctrl);
    var q3 = q2 * getLevelDifferenceFactor('control', levelDifference);

    return Math.floor(q3);
};

function isActionEq(action1, action2) {
    return action1.shortName === action2.shortName;
}

function isActionNe(action1, action2) {
    return action1.shortName !== action2.shortName;
}

function EffectTracker() {
    this.countUps = {};
    this.countDowns = {};
    this.indefinites = {};
}

function State(synth, step, lastStep, action, durabilityState, cpState, bonusMaxCp, qualityState, progressState, wastedActions, trickUses, nameOfElementUses, reliability, effects, condition) {
    this.synth = synth;
    this.step = step;
    this.lastStep = lastStep;
    this.action = action;   // the action leading to this State
    this.durabilityState = durabilityState;
    this.cpState = cpState;
    this.bonusMaxCp = bonusMaxCp;
    this.qualityState = qualityState;
    this.progressState = progressState;
    this.wastedActions = wastedActions;
    this.trickUses = trickUses;
    this.nameOfElementUses = nameOfElementUses;
    this.reliability = reliability;
    this.effects = effects;
    this.condition =  condition;

    // Internal state variables set after each step.
    this.iqCnt = 0;
    this.control = 0;
    this.qualityGain = 0;
    this.bProgressGain = 0;
    this.bQualityGain = 0;
    this.success = 0;
}

State.prototype.clone = function () {
    return new State(this.synth, this.step, this.lastStep, this.action, this.durabilityState, this.cpState, this.bonusMaxCp, this.qualityState, this.progressState, this.wastedActions, this.trickUses, this.nameOfElementUses, this.reliability, clone(this.effects), this.condition);
};

State.prototype.checkViolations = function () {
    // Check for feasibility violations
    var progressOk = false;
    var cpOk = false;
    var durabilityOk = false;
    var trickOk = false;
    var reliabilityOk = false;

    if (this.progressState >= this.synth.recipe.difficulty) {
        progressOk = true;
    }

    if (this.cpState >= 0) {
        cpOk = true;
    }

    // Consider removing sanity check in UpdateState
    if ((this.durabilityState >= 0) && (this.progressState >= this.synth.recipe.difficulty)) {
        durabilityOk = true;
    }

    if (this.trickUses <= this.synth.maxTrickUses) {
        trickOk = true;
    }

    if (this.reliability >= this.synth.reliabilityIndex) {
        reliabilityOk = true;
    }
    
    return {
        progressOk: progressOk,
        cpOk: cpOk,
        durabilityOk: durabilityOk,
        trickOk: trickOk,
        reliabilityOk: reliabilityOk
    };
};

function NewStateFromSynth(synth) {
    var step = 0;
    var lastStep = 0;
    var durabilityState = synth.recipe.durability;
    var cpState = synth.crafter.craftPoints;
    var bonusMaxCp = 0;
    var qualityState = synth.recipe.startQuality;
    var progressState = 0;
    var wastedActions = 0;
    var trickUses = 0;
    var nameOfElementUses = 0;
    var reliability = 1;
    var effects = new EffectTracker();
    var condition = 'Normal';

    return new State(synth, step, lastStep, '', durabilityState, cpState, bonusMaxCp, qualityState, progressState, wastedActions, trickUses, nameOfElementUses, reliability, effects, condition);
}

function probGoodForSynth(synth) {
    var recipeLevel = synth.recipe.level;
    var qualityAssurance = synth.crafter.level >= 63;
    if (recipeLevel >= 300) { // 70*+
        return qualityAssurance ? 0.11 : 0.10;
    }
    else if (recipeLevel >= 276) { // 65+
        return qualityAssurance ? 0.17 : 0.15;
    }
    else if (recipeLevel >= 255) { // 61+
        return qualityAssurance ? 0.22 : 0.20;
    }
    else if (recipeLevel >= 150) { // 60+
        return qualityAssurance ? 0.11 : 0.10;
    }
    else if (recipeLevel >= 136) { // 55+
        return qualityAssurance ? 0.17 : 0.15;
    }
    else {
        return qualityAssurance ? 0.27 : 0.25;
    }
}

function probExcellentForSynth(synth) {
    var recipeLevel = synth.recipe.level;
    if (recipeLevel >= 300) { // 70*+
        return 0.01;
    }
    else if (recipeLevel >= 255) { // 61+
        return 0.02;
    }
    else if (recipeLevel >= 150) { // 60+
        return 0.01;
    }
    else {
        return 0.02;
    }
}

function calcNameOfMultiplier(s) {
    /* From http://redd.it/3ejmp2 and http://redd.it/3d3meb
     Assume for now that the function is linear, but capped with a minimum of 110%
     */
    var percentComplete = Math.floor(s.progressState / s.synth.recipe.difficulty * 100) / 100;
    var nameOfMultiplier = -2 * percentComplete + 3;
    nameOfMultiplier = Math.max(nameOfMultiplier, 1.0);

    return nameOfMultiplier;
}

function getEffectiveCrafterLevel(synth) {
    var effCrafterLevel = synth.crafter.level;
    if (LevelTable[synth.crafter.level]) {
        effCrafterLevel = LevelTable[synth.crafter.level];
    }
    return effCrafterLevel;
}

function ApplyModifiers(s, action, condition) {

    // Effect Modifiers
    //=================
    var craftsmanship = s.synth.crafter.craftsmanship;
    var control = s.synth.crafter.control;

    // Effects modifying control
    if (AllActions.innerQuiet.shortName in s.effects.countUps) {
        control += Math.floor(2 * s.effects.countUps[AllActions.innerQuiet.shortName] * s.synth.crafter.control * 0.1);
    }

    // Effects modifying level difference
    var effCrafterLevel = getEffectiveCrafterLevel(s.synth);
    var effRecipeLevel = s.synth.recipe.level;
    var levelDifference = effCrafterLevel - effRecipeLevel;
    var originalLevelDifference = effCrafterLevel - effRecipeLevel;
    var pureLevelDifference = s.synth.crafter.level - s.synth.recipe.baseLevel;
    var recipeLevel = effRecipeLevel;
    var stars = s.synth.recipe.stars;

    // Effects modfiying probability
    var successProbability = action.successProbability;
    if (isActionEq(action, AllActions.focusedSynthesis) || isActionEq(action, AllActions.focusedTouch)) {
        if (s.action === AllActions.observe.shortName) {
            successProbability = 1.0;
        }
    }
    successProbability = Math.min(successProbability, 1);

    // Effects modifying progress increase multiplier
    var progressIncreaseMultiplier = 1;

    if ((action.progressIncreaseMultiplier > 0) && (s.effects.countDowns.hasOwnProperty(AllActions.muscleMemory.shortName))){
        progressIncreaseMultiplier += 1;
        delete s.effects.countDowns[AllActions.muscleMemory.shortName];
    }

    if (AllActions.veneration.shortName in s.effects.countDowns) {
        progressIncreaseMultiplier += 0.5;
    }

    // Brand actions
    if (isActionEq(action, AllActions.brandOfTheElements)) {
        var nameOfMultiplier = 1;
        if (s.effects.countDowns.hasOwnProperty(AllActions.nameOfTheElements.shortName)) {
            nameOfMultiplier = Math.min(calcNameOfMultiplier(s), 2);
        }
        progressIncreaseMultiplier *= nameOfMultiplier;
    }

    // Effects modifying progress
    var bProgressGain = s.synth.calculateBaseProgressIncrease(levelDifference, craftsmanship, effCrafterLevel, s.synth.recipe.level, s.synth.recipe.scraft);

    // Effects modifying quality
    var bQualityGain = s.synth.calculateBaseQualityIncrease(levelDifference, control, effCrafterLevel, s.synth.recipe.level, s.synth.recipe.sctrl);
    
    // Effects modifying quality increase multiplier
    var qualityIncreaseMultiplier = 1;
    var qualityEffGain = action.qualityIncreaseMultiplier;

    if (AllActions.innovation.shortName in s.effects.countDowns) {
        qualityIncreaseMultiplier += 0.5;
    }

    // We can only use Byregot actions when we have at least 2 stacks of inner quiet
    if (isActionEq(action, AllActions.byregotsBlessing)) {
        if ((AllActions.innerQuiet.shortName in s.effects.countUps) && s.effects.countUps[AllActions.innerQuiet.shortName] >= 1) {
            qualityEffGain += 0.2 * s.effects.countUps[AllActions.innerQuiet.shortName];
        } else {
            s.wastedActions += 1;
            qualityEffGain = 0;
        }
    }

    if ((AllActions.greatStrides.shortName in s.effects.countDowns) && (qualityIncreaseMultiplier > 0)) {
        qualityIncreaseMultiplier += 1;
    }

    bProgressGain = progressIncreaseMultiplier * action.progressIncreaseMultiplier * bProgressGain;
    bQualityGain = qualityIncreaseMultiplier * qualityEffGain * bQualityGain;

    if (isActionEq(action, AllActions.muscleMemory)) {
        if (s.step != 1) {
            s.wastedActions += 1;
            bProgressGain = 0;
        }
    }

    if (isActionEq(action, AllActions.trainedEye)) {
        if ((s.step == 1) && (pureLevelDifference >= 10))  {
            bQualityGain = s.synth.recipe.maxQuality;
        }
        else {
            s.wastedActions += 1;
        }
    }

    // We can only use Precise Touch when state material condition is Good or Excellent. Default is true for probabilistic method.
    if (isActionEq(action, AllActions.preciseTouch)) {
        if (condition.checkGoodOrExcellent()) {
            bQualityGain *= condition.pGoodOrExcellent();
        } else {
            bQualityGain = 0;
            s.wastedActions += 1;
        }
    }

    if (isActionEq(action, AllActions.reflect)) {
        if (s.step != 1) {
            s.wastedActions += 1;
            control = 0;
            bQualityGain = 0;
            qualityIncreaseMultiplier = 0;
        }
    }

    // Effects modifying durability cost
    var durabilityCost = action.durabilityCost;
    if ((AllActions.wasteNot.shortName in s.effects.countDowns) || (AllActions.wasteNot2.shortName in s.effects.countDowns)) {
        if (isActionEq(action, AllActions.prudentTouch)) {
            bQualityGain = 0;
        }
        else {
            durabilityCost *= 0.5;
        }
    }

    if (isActionEq(action, AllActions.groundwork)) {
        // Groundwork is only half as effective if not enough dura
        // console.log(s.durabilityState, durabilityCost, s.durabilityState < durabilityCost);
        if (s.durabilityState < durabilityCost) {
            s.wastedActions += 1;
            bProgressGain *= 0.5;
        }
    }

    // Effects modifying cp cost
    var cpCost = action.cpCost;

    if (isActionEq(action, AllActions.standardTouch)) {
        if (s.action === AllActions.basicTouch.shortName) {
            cpCost = 18;
        }
    }

    var maxProgress = s.synth.recipe.difficulty;

    // Cannot allow progress to go past 100%
    if (bProgressGain + s.progressState > maxProgress)
    {
        // Final Appraisal caps the progress to one shy
        if (AllActions.finalAppraisal.shortName in s.effects.countDowns)
        {
            s.wastedActions += 1;
            bProgressGain = maxProgress - s.progressState - 1;
            delete s.effects.countDowns[AllActions.finalAppraisal.shortName];
        }
    }

    return {
        craftsmanship: craftsmanship,
        control: control,
        effCrafterLevel: effCrafterLevel,
        effRecipeLevel: effRecipeLevel,
        levelDifference: levelDifference,
        successProbability: successProbability,
        qualityIncreaseMultiplier: qualityIncreaseMultiplier,
        bProgressGain: bProgressGain,
        bQualityGain: bQualityGain,
        durabilityCost: durabilityCost,
        cpCost: cpCost
    };
}

function useConditionalAction (s, condition) {
    if (s.cpState > 0 && condition.checkGoodOrExcellent()) {
        s.trickUses += 1;
        return true;
    }
    else {
        s.wastedActions += 1;
        return false;
    }
}

function ApplySpecialActionEffects(s, action, condition) {
    // STEP_02
    // Effect management
    //==================================
    // Special Effect Actions

    // final appraisal does not actually cause anything to happen
    if (isActionEq(action, AllActions.finalAppraisal))
    {
        return;
    }

    if (isActionEq(action, AllActions.mastersMend)) {
        s.durabilityState += 30;
    }

    if ((AllActions.manipulation.shortName in s.effects.countDowns) && (s.durabilityState > 0) && !isActionEq(action, AllActions.manipulation)) {
        s.durabilityState += 5;
    }

    if (isActionEq(action, AllActions.byregotsBlessing)) {
        if (AllActions.innerQuiet.shortName in s.effects.countUps) {
            delete s.effects.countUps[AllActions.innerQuiet.shortName];
        }
        else {
            s.wastedActions += 1;
        }
    }

    if (isActionEq(action, AllActions.reflect)) {
        if (s.step == 1) {
            s.effects.countUps[AllActions.innerQuiet.shortName] = 2;
        } else {
            s.wastedActions += 1;
        }
    }

    if ((action.qualityIncreaseMultiplier > 0) && (AllActions.greatStrides.shortName in s.effects.countDowns)) {
        delete s.effects.countDowns[AllActions.greatStrides.shortName];
    }

    // Manage effects with conditional requirements
    if (action.onExcellent || action.onGood) {
        if (useConditionalAction(s, condition)) {
            if (isActionEq(action, AllActions.tricksOfTheTrade)) {
                s.cpState += 20 * condition.pGoodOrExcellent();
            }
        }
    }

    if (isActionEq(action, AllActions.innovation.shortName) && (AllActions.innovation.shortName in s.effects.countDowns)) {
        s.wastedActions += 1
    }
    if (isActionEq(action, AllActions.veneration.shortName) && (AllActions.veneration.shortName in s.effects.countDowns)) {
        s.wastedActions += 1
    }
}

function UpdateEffectCounters(s, action, condition, successProbability) {
    // STEP_03
    // Countdown / Countup Management
    //===============================
    // Decrement countdowns unless its final appraisal
    if (!isActionEq(action, AllActions.finalAppraisal))
    {
        for (var countDown in s.effects.countDowns) {
            s.effects.countDowns[countDown] -= 1;

            if (s.effects.countDowns[countDown] === 0) {
                delete s.effects.countDowns[countDown];
            }
        }
    }

    if (AllActions.innerQuiet.shortName in s.effects.countUps) {
        // Increment inner quiet countups that have conditional requirements
        if (isActionEq(action, AllActions.patientTouch)) {
            s.effects.countUps[AllActions.innerQuiet.shortName] = //+= 2 * successProbability;
                ((s.effects.countUps[AllActions.innerQuiet.shortName] * 2) * successProbability) +
                ((s.effects.countUps[AllActions.innerQuiet.shortName] / 2) * (1 - successProbability));
        }
        else if (isActionEq(action, AllActions.preparatoryTouch)) {
            s.effects.countUps[AllActions.innerQuiet.shortName] += 2;
        }
        // Increment inner quiet countups that have conditional requirements
        else if (isActionEq(action, AllActions.preciseTouch) && condition.checkGoodOrExcellent()) {
            s.effects.countUps[AllActions.innerQuiet.shortName] += 2 * successProbability * condition.pGoodOrExcellent();
        }
        // Increment all other inner quiet count ups
        else if (action.qualityIncreaseMultiplier > 0 && !isActionEq(action, AllActions.reflect)) {
            s.effects.countUps[AllActions.innerQuiet.shortName] += 1 * successProbability;
        }

        // Cap inner quiet stacks at 10 (11)
        s.effects.countUps[AllActions.innerQuiet.shortName] = Math.min(s.effects.countUps[AllActions.innerQuiet.shortName], 10);
    }

    // Initialize new effects after countdowns are managed to reset them properly
    if (action.type === 'countup') {
        s.effects.countUps[action.shortName] = 0;
    }

    if (action.type === 'indefinite') {
        if (isActionEq(action, AllActions.initialPreparations)) {
            if (s.step == 1) {
                s.effects.indefinites[action.shortName] = true;
            }
            else {
                s.wastedActions += 1;
            }
        }
        else {
            s.effects.indefinites[action.shortName] = true;
        }
    }

    if (action.type === 'countdown') {
        if (action.shortName.indexOf('nameOf') >= 0) {
            if (s.nameOfElementUses == 0) {
                s.effects.countDowns[action.shortName] = action.activeTurns;
                s.nameOfElementUses += 1;
            }
            else {
                s.wastedActions += 1;
            }
        }
        else {
            s.effects.countDowns[action.shortName] = action.activeTurns;
        }
    }
}

function UpdateState(s, action, progressGain, qualityGain, durabilityCost, cpCost, condition, successProbability) {
    // State tracking
    s.progressState += progressGain;
    s.qualityState += qualityGain;
    s.durabilityState -= durabilityCost;
    s.cpState -= cpCost;
    s.lastStep += 1;

    ApplySpecialActionEffects(s, action, condition);
    UpdateEffectCounters(s, action, condition, successProbability);

    // Sanity checks for state variables
    if ((s.durabilityState >= -5) && (s.progressState >= s.synth.recipe.difficulty)) {
        s.durabilityState = 0;
    }
    s.durabilityState = Math.min(s.durabilityState, s.synth.recipe.durability);
    s.cpState = Math.min(s.cpState, s.synth.crafter.craftPoints + s.bonusMaxCp);
}

function simSynth(individual, startState, assumeSuccess, verbose, debug, logOutput) {
    verbose = verbose !== undefined ? verbose : true;
    debug = debug !== undefined ? debug : false;
    logOutput = logOutput !== undefined ? logOutput : null;

    var logger = new Logger(logOutput);

    // Clone startState to keep startState immutable
    var s = startState.clone();

    // Conditions
    var pGood = probGoodForSynth(s.synth);
    var pExcellent = probExcellentForSynth(s.synth);
    var ignoreConditionReq = !s.synth.useConditions;

    // Step 1 is always normal
    var ppGood = 0;
    var ppExcellent = 0;
    var ppPoor = 0;
    var ppNormal = 1 - (ppGood + ppExcellent + ppPoor);

    var SimCondition = {
        checkGoodOrExcellent: function () {
            return true;
        },
        pGoodOrExcellent: function () {
            if (ignoreConditionReq) {
                return 1;
            }
            else {
                return ppGood + ppExcellent;
            }
        }
    };

    // Check for null or empty individuals
    if (individual === null || individual.length === 0) {
        return NewStateFromSynth(s.synth);
    }

    if (debug) {
        logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s %-8s %-8s %-5s %-5s %-5s', '#', 'Action', 'DUR', 'CP', 'EQUA', 'EPRG', 'IQ', 'CTL', 'QINC', 'BPRG', 'BQUA', 'WAC');
        logger.log('%2d %30s %5.0f %5.0f %8.1f %8.1f %5.1f %8.1f %8.1f %5.0f %5.0f %5.0f', s.step, '', s.durabilityState, s.cpState, s.qualityState, s.progressState, 0, s.synth.crafter.control, 0, 0, 0, 0);
    }
    else if (verbose) {
        logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s', '#', 'Action', 'DUR', 'CP', 'EQUA', 'EPRG', 'IQ');
        logger.log('%2d %30s %5.0f %5.0f %8.1f %8.1f %5.1f', s.step, '', s.durabilityState, s.cpState, s.qualityState, s.progressState, 0);

    }

    for (var i = 0; i < individual.length; i++) {
        var action = individual[i];

        // Occur regardless of dummy actions
        //==================================
        if (!isActionEq(action, AllActions.finalAppraisal))
        {
            s.step += 1;
        }

        // Condition Calculation
        var condQualityIncreaseMultiplier = 1;
        if (!ignoreConditionReq) {
            condQualityIncreaseMultiplier *= (ppNormal + 1.5 * ppGood * Math.pow(1 - (ppGood + pGood) / 2, s.synth.maxTrickUses) + 4 * ppExcellent + 0.5 * ppPoor);
        }

        // Calculate Progress, Quality and Durability gains and losses under effect of modifiers
        var r = ApplyModifiers(s, action, SimCondition);

        // Calculate final gains / losses
        var successProbability = r.successProbability;
        if (assumeSuccess) {
            successProbability = 1;
        }
        var progressGain = r.bProgressGain;
        if (progressGain > 0) {
            s.reliability = s.reliability * successProbability;
        }

        var qualityGain = condQualityIncreaseMultiplier * r.bQualityGain;

        // Floor gains at final stage before calculating expected value
        progressGain = successProbability * Math.floor(progressGain);
        qualityGain = successProbability * Math.floor(qualityGain);

        // Occur if a wasted action
        //==================================
        if (((s.progressState >= s.synth.recipe.difficulty) || (s.durabilityState <= 0) || (s.cpState < 0)) && (action != AllActions.dummyAction)) {
            s.wastedActions += 1;
        }

        // Occur if not a wasted action
        //==================================
        else {

            UpdateState(s, action, progressGain, qualityGain, r.durabilityCost, r.cpCost, SimCondition, successProbability);

            // Ending condition update
            if (!ignoreConditionReq) {
                ppPoor = ppExcellent;
                ppGood = pGood * ppNormal;
                ppExcellent = pExcellent * ppNormal;
                ppNormal = 1 - (ppGood + ppExcellent + ppPoor);
            }

        }

        var iqCnt = 0;
        if (AllActions.innerQuiet.shortName in s.effects.countUps) {
            iqCnt = s.effects.countUps[AllActions.innerQuiet.shortName];
        }
        if (debug) {
            logger.log('%2d %30s %5.0f %5.0f %8.1f %8.1f %5.1f %8.1f %8.1f %5.0f %5.0f %5.0f', s.step, action.name, s.durabilityState, s.cpState, s.qualityState, s.progressState, iqCnt, r.control, qualityGain, Math.floor(r.bProgressGain), Math.floor(r.bQualityGain), s.wastedActions);
        }
        else if (verbose) {
            logger.log('%2d %30s %5.0f %5.0f %8.1f %8.1f %5.1f', s.step, action.name, s.durabilityState, s.cpState, s.qualityState, s.progressState, iqCnt);
        }

        s.action = action.shortName
    }

    // Check for feasibility violations
    var chk = s.checkViolations();

    if (debug) {
        logger.log('Progress Check: %s, Durability Check: %s, CP Check: %s, Tricks Check: %s, Reliability Check: %s, Wasted Actions: %d', chk.progressOk, chk.durabilityOk, chk.cpOk, chk.trickOk, chk.reliabilityOk, s.wastedActions);
    }
    else if (verbose) {
        logger.log('Progress Check: %s, Durability Check: %s, CP Check: %s, Tricks Check: %s, Reliability Check: %s, Wasted Actions: %d', chk.progressOk, chk.durabilityOk, chk.cpOk, chk.trickOk, chk.reliabilityOk, s.wastedActions);
    }

    // Return final state
    s.action = individual[individual.length-1].shortName;
    return s;

}

function MonteCarloStep(startState, action, assumeSuccess, verbose, debug, logOutput) {
    verbose = verbose !== undefined ? verbose : true;
    debug = debug !== undefined ? debug : false;
    logOutput = logOutput !== undefined ? logOutput : null;

    var logger = new Logger(logOutput);

    // Clone startState to keep startState immutable
    var s = startState.clone();

    // Conditions
    var pGood = probGoodForSynth(s.synth);
    var pExcellent = probExcellentForSynth(s.synth);
    var ignoreConditionReq = !s.synth.useConditions;
    var randomizeConditions = !ignoreConditionReq;

    var MonteCarloCondition = {
        checkGoodOrExcellent: function () {
            if (ignoreConditionReq) {
                return true;
            }
            else {
                return (s.condition == 'Good' || s.condition == 'Excellent');
            }
        },
        pGoodOrExcellent: function () {
            return 1;
        }
    };

    // Initialize counters
    if (!isActionEq(action, AllActions.finalAppraisal))
    {
        s.step += 1;
    }

    // Condition Evaluation
    var condQualityIncreaseMultiplier = 1;
    if (s.condition === 'Excellent') {
        condQualityIncreaseMultiplier *= 4.0;
    }
    else if (s.condition === 'Good' ) {
        condQualityIncreaseMultiplier *= 1.5;
    }
    else if (s.condition === 'Poor' ) {
        condQualityIncreaseMultiplier *= 0.5;
    }
    else {
        condQualityIncreaseMultiplier *= 1.0;
    }

    // Calculate Progress, Quality and Durability gains and losses under effect of modifiers
    var r = ApplyModifiers(s, action, MonteCarloCondition);

    // Success or Failure
    var success = 0;
    var successRand = Math.random();
    if (0 <= successRand && successRand <= r.successProbability) {
        success = 1;
    }

    if (assumeSuccess) {
        success = 1;
    }

    // Calculate final gains / losses
    var progressGain = success * r.bProgressGain;
    if (progressGain > 0) {
        s.reliability = s.reliability * r.successProbability;
    }

    var qualityGain = success * condQualityIncreaseMultiplier * r.bQualityGain;

    // Floor gains at final stage before calculating expected value
    progressGain = Math.floor(progressGain);
    qualityGain = Math.floor(qualityGain);

    // Occur if a dummy action
    //==================================
    if ((s.progressState >= s.synth.recipe.difficulty || s.durabilityState <= 0 || s.cpState < 0) && action != AllActions.dummyAction) {
        s.wastedActions += 1;
    }
    // Occur if not a dummy action
    //==================================
    else {
        UpdateState(s, action, progressGain, qualityGain, r.durabilityCost, r.cpCost, MonteCarloCondition, success);
    }

    // Ending condition update
    if (s.condition === 'Excellent') {
        s.condition = 'Poor';
    }
    else if (s.condition === 'Good' || s.condition === 'Poor') {
        s.condition = 'Normal';
    }
    else if (s.condition === 'Normal') {
        if (randomizeConditions) {
            var condRand = Math.random();
            if (0 <= condRand && condRand < pExcellent) {
                s.condition = 'Excellent';
            }
            else if (pExcellent <= condRand && condRand < (pExcellent + pGood)) {
                s.condition = 'Good';
            }
            else {
                s.condition = 'Normal';
            }
        }
        else {
            s.condition = 'Normal';
        }
    }

    // Check for feasibility violations
    var chk = s.checkViolations();

    var iqCnt = 0;
    if (AllActions.innerQuiet.shortName in s.effects.countUps) {
        iqCnt = s.effects.countUps[AllActions.innerQuiet.shortName];
    }

    // Add internal state variables for later output of best and worst cases
    s.action = action.shortName;
    s.iqCnt = iqCnt;
    s.control = r.control;
    s.qualityGain = qualityGain;
    s.bProgressGain = Math.floor(r.bProgressGain);
    s.bQualityGain = Math.floor(r.bQualityGain);
    s.success = success;

    if (debug) {
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %5.0f %5.0f %5.0f %5.0f %5.0f %-10s %5.0f', s.step, action.name, s.durabilityState, s.cpState, s.qualityState, s.progressState, s.iqCnt, s.control, s.qualityGain, s.bProgressGain, s.bQualityGain, s.wastedActions, s.condition, s.success);
    }
    else if (verbose) {
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %-10s %-5s', s.step, action.name, s.durabilityState, s.cpState, s.qualityState, s.progressState, s.iqCnt, s.condition, s.success);
    }

    // Return final state
    return s;

}

function MonteCarloSequence(individual, startState, assumeSuccess, conditionalActionHandling, verbose, debug, logOutput) {
    verbose = verbose !== undefined ? verbose : true;
    debug = debug !== undefined ? debug : false;
    logOutput = logOutput !== undefined ? logOutput : null;

    if (conditionalActionHandling !== 'reposition' && conditionalActionHandling !== 'skipUnusable' && conditionalActionHandling !== 'ignoreUnusable') {
        throw new Error("invalid conditionalActionHandling value: " + conditionalActionHandling);
    }

    var logger = new Logger(logOutput);

    var s = startState;

    // Initialize counters
    var maxConditionUses = 0;

    // Check for null or empty individuals
    if (individual === null || individual.length === 0) {
        return [startState];
    }

    // Strip Tricks of the Trade from individual
    if (conditionalActionHandling === 'reposition') {
        var onExcellentOnlyActions = [];
        var onGoodOnlyActions = [];
        var onGoodOrExcellentActions = [];
        var onPoorOnlyActions = [];
        var tempIndividual = [];
        for (var i=0; i < individual.length; i++) {
            if (individual[i].onExcellent && !individual[i].onGood) {
                onExcellentOnlyActions.push(individual[i]);
                maxConditionUses += 1;
            }
            else if ((individual[i].onGood && !individual[i].onExcellent) && !individual[i].onPoor) {
                onGoodOnlyActions.push(individual[i]);
                maxConditionUses += 1;
            }
            else if (individual[i].onGood || individual[i].onExcellent) {
                onGoodOrExcellentActions.push(individual[i]);
                maxConditionUses += 1;
            }
            else if (individual[i].onPoor && !(individual[i].onExcellent || individual[i].onGood)) {
                onPoorOnlyActions.push(individual[i]);
                maxConditionUses += 1;
            }
            else {
                tempIndividual.push(individual[i]);
            }
        }
        individual = tempIndividual;
    }

    if (debug) {
        logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s %-5s %-5s %-5s %-5s %-5s %-10s %-5s', '#', 'Action', 'DUR', 'CP', 'QUA', 'PRG', 'IQ', 'CTL', 'QINC', 'BPRG', 'BQUA', 'WAC', 'Cond', 'S/F');
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %5.0f %5.0f %5.0f %5.0f %5.0f %-10s %5.0f', s.step, '', s.durabilityState, s.cpState, s.qualityState, s.progressState, 0, s.synth.crafter.control, 0, 0, 0, 0, 'Normal', '');
    }
    else if (verbose) {
        logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s %-10s %-5s', '#', 'Action', 'DUR', 'CP', 'QUA', 'PRG', 'IQ', 'Cond', 'S/F');
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %-10s %5.0f', s.step, '', s.durabilityState, s.cpState, s.qualityState, s.progressState, 0, 'Normal', 0);

    }

    var states = [];

    states.push(s);

    for (i=0; i < individual.length; i++) {
        var action = individual[i];

        // Determine if action is usable
        var usable = action.onExcellent && s.condition === 'Excellent' ||
                     action.onGood && s.condition === 'Good' ||
                     action.onPoor && s.condition === 'Poor' ||
                     (!action.onExcellent && !action.onGood && !action.onPoor);

        if (conditionalActionHandling === 'reposition') {
            // Manually re-add condition dependent action when conditions are met
            if (s.condition === 'Excellent' && s.trickUses < maxConditionUses) {
                if (onExcellentOnlyActions.length > 0) {
                    s = MonteCarloStep(s, onExcellentOnlyActions.shift(), assumeSuccess, verbose, debug, logOutput);
                    states.push(s);
                }
                else if (onGoodOrExcellentActions.length > 0) {
                    s = MonteCarloStep(s, onGoodOrExcellentActions.shift(), assumeSuccess, verbose, debug, logOutput);
                    states.push(s);
                }
            }
            if (s.condition === 'Good' && s.trickUses < maxConditionUses) {
                if (onGoodOnlyActions.length > 0) {
                    s = MonteCarloStep(s, onGoodOnlyActions.shift(), assumeSuccess, verbose, debug, logOutput);
                    states.push(s);
                }
                else if (onGoodOrExcellentActions.length > 0) {
                    s = MonteCarloStep(s, onGoodOrExcellentActions.shift(), assumeSuccess, verbose, debug, logOutput);
                    states.push(s);
                }
            }
            if (s.condition === 'Poor' && s.trickUses < maxConditionUses) {
                if (onPoorOnlyActions.length > 0) {
                    s = MonteCarloStep(s, onPoorOnlyActions.shift(), assumeSuccess, verbose, debug, logOutput);
                    states.push(s);
                }
            }

            // Process the original action as another step
            s = MonteCarloStep(s, action, assumeSuccess, verbose, debug, logOutput);
            states.push(s);
        }
        else if (conditionalActionHandling === 'skipUnusable') {
            // If not usable, record a skipped action without progressing other status counters
            if (!usable) {
                s = s.clone();
                s.action = action.shortName;
                s.wastedActions += 1;
                states.push(s);
            }
            // Otherwise, process action as normal
            else {
                s = MonteCarloStep(s, action, assumeSuccess, verbose, debug, logOutput);
                states.push(s);
            }
        }
        else if (conditionalActionHandling === 'ignoreUnusable') {
            // If not usable, skip action effect, progress other status counters
            s = MonteCarloStep(s, action, assumeSuccess, verbose, debug, logOutput);
            states.push(s);
        }
    }

    // Check for feasibility violations
    var chk = s.checkViolations();

    if (debug) {
        logger.log('Progress Check: %s, Durability Check: %s, CP Check: %s, Tricks Check: %s, Reliability Check: %s, Wasted Actions: %d', chk.progressOk, chk.durabilityOk, chk.cpOk, chk.trickOk, chk.reliabilityOk, s.wastedActions);
    }
    else if (verbose) {
        logger.log('Progress Check: %s, Durability Check: %s, CP Check: %s, Tricks Check: %s, Reliability Check: %s, Wasted Actions: %d', chk.progressOk, chk.durabilityOk, chk.cpOk, chk.trickOk, chk.reliabilityOk, s.wastedActions);
    }

    return states;
}

function MonteCarloSim(individual, synth, nRuns, assumeSuccess, conditionalActionHandling, verbose, debug, logOutput) {
    verbose = verbose !== undefined ? verbose : false;
    debug = debug !== undefined ? debug : false;
    logOutput = logOutput !== undefined ? logOutput : null;

    var logger = new Logger(logOutput);

    var startState = NewStateFromSynth(synth);

    var bestSequenceStates;
    var worseSequenceStates;
    var finalStateTracker = [];
    for (var i=0; i < nRuns; i++) {
        var states = MonteCarloSequence(individual, startState, assumeSuccess, conditionalActionHandling, false, false, logOutput);
        var finalState = states[states.length-1];

        if (!bestSequenceStates || finalState.qualityState > bestSequenceStates[bestSequenceStates.length-1].qualityState) {
            bestSequenceStates = states;
        }

        if (!worseSequenceStates || finalState.qualityState < worseSequenceStates[worseSequenceStates.length-1].qualityState) {
            worseSequenceStates = states;
        }

        finalStateTracker.push(finalState);

        if (verbose) {
            logger.log('%2d %-20s %5d %5d %8.1f %5.1f %5d', i, 'MonteCarlo', finalState.durabilityState, finalState.cpState, finalState.qualityState, finalState.progressState, finalState.wastedActions);
        }
    }

    var avgDurability = getAverageProperty(finalStateTracker, 'durabilityState', nRuns);
    var avgCp = getAverageProperty(finalStateTracker, 'cpState', nRuns);
    var avgQuality = getAverageProperty(finalStateTracker, 'qualityState', nRuns);
    var avgProgress = getAverageProperty(finalStateTracker, 'progressState', nRuns);
    var avgHqPercent = getAverageHqPercent(finalStateTracker);
    var avgStats = {
        durability: avgDurability,
        cp: avgCp,
        quality: avgQuality,
        progress: avgProgress,
        hqPercent: avgHqPercent
    };

    var successRate = getSuccessRate(finalStateTracker);

    logger.log('%-2s %20s %-5s %-5s %-8s %-5s %-5s','', '', 'DUR', 'CP', 'QUA', 'PRG', 'HQ%');
    logger.log('%2s %-20s %5.0f %5.0f %8.1f %5.1f %5.1f', '##', 'Expected Value: ', avgDurability, avgCp, avgQuality, avgProgress, avgHqPercent);

    var mdnDurability = getMedianProperty(finalStateTracker, 'durabilityState', nRuns);
    var mdnCp = getMedianProperty(finalStateTracker, 'cpState', nRuns);
    var mdnQuality = getMedianProperty(finalStateTracker, 'qualityState', nRuns);
    var mdnProgress = getMedianProperty(finalStateTracker, 'progressState', nRuns);
    var mdnHqPercent = getMedianHqPercent(finalStateTracker);
    var mdnStats = {
        durability: mdnDurability,
        cp: mdnCp,
        quality: mdnQuality,
        progress: mdnProgress,
        hqPercent: mdnHqPercent
    };

    logger.log('%2s %-20s %5.0f %5.0f %8.1f %5.1f %5.1f', '##', 'Median Value: ', mdnDurability, mdnCp, mdnQuality, mdnProgress, mdnHqPercent   );

    var minDurability = getMinProperty(finalStateTracker, 'durabilityState');
    var minCp = getMinProperty(finalStateTracker, 'cpState');
    var minQuality = getMinProperty(finalStateTracker, 'qualityState');
    var minProgress = getMinProperty(finalStateTracker, 'progressState');
    var minQualityPercent = Math.min(synth.recipe.maxQuality, minQuality)/synth.recipe.maxQuality * 100;
    var minHqPercent = hqPercentFromQuality(minQualityPercent);
    var minStats = {
        durability: minDurability,
        cp: minCp,
        quality: minQuality,
        progress: minProgress,
        hqPercent: minHqPercent
    };

    logger.log('%2s %-20s %5.0f %5.0f %8.1f %5.1f %5.1f', '##', 'Min Value: ', minDurability, minCp, minQuality, minProgress, minHqPercent);

    var maxDurability = getMaxProperty(finalStateTracker, 'durabilityState');
    var maxCp = getMaxProperty(finalStateTracker, 'cpState');
    var maxQuality = getMaxProperty(finalStateTracker, 'qualityState');
    var maxProgress = getMaxProperty(finalStateTracker, 'progressState');
    var maxQualityPercent = Math.max(synth.recipe.maxQuality, maxQuality)/synth.recipe.maxQuality * 100;
    var maxHqPercent = hqPercentFromQuality(maxQualityPercent);
    var maxStats = {
        durability: maxDurability,
        cp: maxCp,
        quality: maxQuality,
        progress: maxProgress,
        hqPercent: maxHqPercent
    };

    logger.log('%2s %-20s %5.0f %5.0f %8.1f %5.1f %5.1f', '##', 'Max Value: ', maxDurability, maxCp, maxQuality, maxProgress, maxHqPercent);

    logger.log('\n%2s %-20s %5.1f %%', '##', 'Success Rate: ', successRate);

    logger.log('');

    logger.log("Monte Carlo Random Example");
    logger.log("==========================");
    MonteCarloSequence(individual, startState, assumeSuccess, conditionalActionHandling, false, true, logOutput);

    logger.log('');

    logger.log("Monte Carlo Best Example");
    logger.log("==========================");
    logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s %-5s %-5s %-5s %-5s %-5s %-10s %-5s', '#', 'Action', 'DUR', 'CP', 'QUA', 'PRG', 'IQ', 'CTL', 'QINC', 'BPRG', 'BQUA', 'WAC', 'Cond', 'S/F');

    for (var i = 0; i < bestSequenceStates.length; i++) {
        var s = bestSequenceStates[i];
        var action = AllActions[s.action];
        var actionName = action ? action.name : '';
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %5.0f %5.0f %5.0f %5.0f %5.0f %-10s %5.0f', s.step, actionName, s.durabilityState, s.cpState, s.qualityState, s.progressState, s.iqCnt, s.control, s.qualityGain, s.bProgressGain, s.bQualityGain, s.wastedActions, s.condition, s.success);
    }

    logger.log('');

    logger.log("Monte Carlo Worst Example");
    logger.log("==========================");
    logger.log('%-2s %30s %-5s %-5s %-8s %-8s %-5s %-5s %-5s %-5s %-5s %-5s %-10s %-5s', '#', 'Action', 'DUR', 'CP', 'QUA', 'PRG', 'IQ', 'CTL', 'QINC', 'BPRG', 'BQUA', 'WAC', 'Cond', 'S/F');

    for (var i = 0; i < worseSequenceStates.length; i++) {
        var s = worseSequenceStates[i];
        var action = AllActions[s.action];
        var actionName = action ? action.name : '';
        logger.log('%2d %30s %5.0f %5.0f %8.0f %8.0f %5.0f %5.0f %5.0f %5.0f %5.0f %5.0f %-10s %5.0f', s.step, actionName, s.durabilityState, s.cpState, s.qualityState, s.progressState, s.iqCnt, s.control, s.qualityGain, s.bProgressGain, s.bQualityGain, s.wastedActions, s.condition, s.success);
    }

    logger.log('');

    return {
        successPercent: successRate,
        average: avgStats,
        median: mdnStats,
        min: minStats,
        max: maxStats,
    }
}

function getAverageProperty(stateArray, propName, nRuns) {
    var sumProperty = 0;
    var nSuccesses = 0;
    for (var i=0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            nSuccesses += 1;
            sumProperty += stateArray[i][propName];
        }
    }

    return sumProperty / nSuccesses;
}

function getMedianProperty(stateArray, propName, nRuns) {
    var listProperty = [];
    for (var i=0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            listProperty.push(stateArray[i][propName]);
        }
    }

    listProperty.sort(function(a, b){return a-b});
    var medianPropIdx = Math.ceil(listProperty.length/2);

    return listProperty[medianPropIdx];
}

function getAverageHqPercent(stateArray) {
    // Because quality can exceed maxQuality, the average will be skewed high and we cannot use average quality as the input to the hqPercentFromQuality function
    var nHQ = 0;
    var nSuccesses = 0;
    for (var i=0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            nSuccesses += 1;

            var qualityPercent = stateArray[i]['qualityState'] / stateArray[i].synth.recipe.maxQuality * 100;
            var hqProbability = hqPercentFromQuality(qualityPercent) / 100;
            var hqRand = Math.random();
            if (hqRand <= hqProbability) {
                nHQ += 1;
            }
        }
    }

    return nHQ / nSuccesses * 100;
}

function getMedianHqPercent(stateArray) {
    // Because quality can exceed maxQuality, the median will be skewed high and we cannot use median quality as the input to the hqPercentFromQuality function
    var hqPercents = [];
    for (var i=0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            var qualityPercent = Math.min(stateArray[i].synth.recipe.maxQuality, stateArray[i]['qualityState']) / stateArray[i].synth.recipe.maxQuality * 100;
            var hqProbability = hqPercentFromQuality(qualityPercent);
            hqPercents.push(hqProbability);
        }
    }

    hqPercents.sort(function(a, b){return a-b});
    var medianPropIdx = Math.ceil(hqPercents.length/2);

    return hqPercents[medianPropIdx];
}

function getSuccessRate(stateArray) {
    var nSuccesses = 0;
    for (var i=0; i < stateArray.length; i++) {
        var chk = stateArray[i].checkViolations();
        var progressOk = chk.progressOk;
        var durabilityOk = chk.durabilityOk;
        var cpOk = chk.cpOk;

        if (progressOk && durabilityOk && cpOk) {
            nSuccesses += 1;
        }
    }

    return nSuccesses / stateArray.length * 100;
}

function getMinProperty(stateArray, propName) {
    var minProperty = null;
    for (var i=0; i < stateArray.length; i++) {
        if (minProperty === null) {
            minProperty = stateArray[i][propName];
        }
        else {
            if (minProperty > stateArray[i][propName]) {
                minProperty = stateArray[i][propName];
            }
        }
    }
    return minProperty;
}

function getMaxProperty(stateArray, propName) {
    var maxProperty = null;
    for (var i=0; i < stateArray.length; i++) {
        if (maxProperty === null) {
            maxProperty = stateArray[i][propName];
        }
        else {
            if (maxProperty < stateArray[i][propName]) {
                maxProperty = stateArray[i][propName];
            }
        }
    }
    return maxProperty;
}

function qualityFromHqPercent(hqPercent) {
    var x = hqPercent;
    return -5.6604E-6 * Math.pow(x, 4) + 0.0015369705 * Math.pow(x, 3) - 0.1426469573 * Math.pow(x, 2) + 5.6122722959 * x - 5.5950384565;
}

function hqPercentFromQuality(qualityPercent) {
    var hqPercent = 1;
    if (qualityPercent === 0) {
        hqPercent = 1;
    }
    else if (qualityPercent >= 100) {
        hqPercent = 100;
    }
    else {
        while (qualityFromHqPercent(hqPercent) < qualityPercent && hqPercent < 100) {
            hqPercent += 1;
        }
    }
    return hqPercent;
}

function evalSeq(individual, mySynth, penaltyWeight) {
    penaltyWeight = penaltyWeight!== undefined ? penaltyWeight : 10000;

    var startState = NewStateFromSynth(mySynth);

    var result = simSynth(individual, startState, false, false, false);
    var penalties = 0;
    var fitness = 0;
    var fitnessProg = 0;

    // Sum the constraint violations
    penalties += result.wastedActions / 100;

    // Check for feasibility violations
    var chk = result.checkViolations();

    if (!chk.durabilityOk) {
       penalties += Math.abs(result.durabilityState);
    }

    if (!chk.progressOk) {
        penalties += Math.abs(mySynth.recipe.difficulty - Math.min(result.progressState, mySynth.recipe.difficulty));
    }

    if (!chk.cpOk) {
        penalties += Math.abs(result.cpState);
    }

    if (result.trickUses > mySynth.maxTrickUses) {
        penalties += Math.abs(result.trickUses - mySynth.maxTrickUses);
    }

    if (result.reliability < mySynth.reliabilityIndex) {
        penalties += Math.abs(mySynth.reliabilityIndex - result.reliability);
    }

    if (mySynth.maxLength > 0) {
        var maxActionsExceeded = individual.length - mySynth.maxLength;
        if (maxActionsExceeded > 0) {
            penalties += 0.1 * maxActionsExceeded;
        }
    }

    fitness += result.qualityState;
    fitness -= penaltyWeight * penalties;
    fitnessProg += result.progressState;

    return [fitness, fitnessProg, result.cpState, individual.length];
}

evalSeq.weights = [1.0, 1.0, 1.0, -1.0];

function heuristicSequenceBuilder(synth) {
    var sequence = [];
    var subSeq1 = [];
    var subSeq2 = [];
    var subSeq3 = [];
    var aa = AllActions;

    var cp = synth.crafter.craftPoints;
    var dur = synth.recipe.durability;
    var progress = 0;

    // Build a list of actions by short name so that we can easily perform lookups
    var actionsByName = {};
    for (var i = 0; i < synth.crafter.actions.length; i++) {
        var action = synth.crafter.actions[i];
        if (action) {
            actionsByName[action.shortName] = true;
        }
    }

    var hasAction = function(actionName) {
        return (actionName in actionsByName);
    };

    var tryAction = function(actionName) {
        return (hasAction(actionName) && cp >= aa[actionName].cpCost && dur - aa[actionName].durabilityCost >= 0);
    };

    var useAction = function(actionName) {
        cp -= aa[actionName].cpCost;
        dur -= aa[actionName].durabilityCost;
    };

    var pushAction = function(seq, actionName) {
        seq.push(aa[actionName]);
        useAction(actionName);
    };

    var unshiftAction = function(seq, actionName) {
        seq.unshift(aa[actionName]);
        useAction(actionName);
    };

    /* Progress to completion
        -- Use ingenuity if available and if recipe is higher level
        -- Determine base progress
        -- Determine best action to use from available list
        -- Steady hand if CS is not available
        -- Master's mend if more steps are needed
    */

    // If crafter level < recipe level and ingenuity 1/2 is available, use it.
    var effCrafterLevel = synth.crafter.level;
    if (LevelTable[synth.crafter.level]) {
        effCrafterLevel = LevelTable[synth.crafter.level];
    }
    var effRecipeLevel = synth.recipe.level;

    if ((effCrafterLevel < effRecipeLevel) && tryAction('veneration')) {
        pushAction(subSeq1, 'veneration');
    }

    // If Careful Synthesis 1 is available, use it
    var preferredAction = 'basicSynth';
    // TODO: standardSynth AKA Basic Synthesis Level 31
    if (hasAction('carefulSynthesis')) {
        preferredAction = 'carefulSynthesis';
    }

    // Determine base progress
    var levelDifference = effCrafterLevel - effRecipeLevel;
    var bProgressGain = synth.calculateBaseProgressIncrease(levelDifference, synth.crafter.craftsmanship, effCrafterLevel, effRecipeLevel, synth.recipe.scraft);
    var progressGain =  bProgressGain;
    progressGain *= aa[preferredAction].progressIncreaseMultiplier;
    progressGain = Math.floor(progressGain);

    var nProgSteps = Math.ceil(synth.recipe.difficulty / progressGain);
    var steps = 0;
    // Final step first
    if (tryAction(preferredAction)) {
        pushAction(subSeq3, preferredAction);
        progress += progressGain;
        steps += 1;
    }

    subSeq2 = [];
    while (progress < synth.recipe.difficulty && steps < nProgSteps) {
        // Don't want to increase progress at 5 durability unless we are able to complete the synth
        if (tryAction(preferredAction) && (dur >= 10)) {
            unshiftAction(subSeq2, preferredAction);
            progress += progressGain;
            steps += 1;
        }
        else if (tryAction('manipulation')) {
            unshiftAction(subSeq2, 'manipulation');
            dur += 30;
        }
        else if (tryAction('mastersMend')) {
            unshiftAction(subSeq2, 'mastersMend');
            dur += 30;
        }
        else {
            break;
        }
    }

    sequence = subSeq2.concat(subSeq3);
    sequence = subSeq1.concat(sequence);

    if (dur <= 20) {
        if (tryAction('manipulation')) {
            unshiftAction(sequence, 'manipulation');
            dur += 30;
        }
        else if (tryAction('mastersMend')) {
            unshiftAction(sequence, 'mastersMend');
            dur += 30;
        }
    }

    subSeq1 = [];
    subSeq2 = [];
    subSeq3 = [];

    /* Improve Quality
     -- Reflect and Inner Quiet at start
     -- Byregot's at end or other Inner Quiet consumer
    */

    if (tryAction('reflect')) {
        pushAction(subSeq1, 'reflect')
    } 
    
    if (tryAction('innerQuiet')) {
        pushAction(subSeq1, 'innerQuiet');
    }

    preferredAction = 'basicTouch';

    // ... and put in at least one quality improving action
    if (tryAction(preferredAction)) {
        pushAction(subSeq2, preferredAction);
    }

    subSeq1 = subSeq1.concat(subSeq2);

    // Now add in Byregot's Blessing at the end of the quality improving stage if we can
    if (tryAction('byregotsBlessing')) {
        unshiftAction(sequence, 'byregotsBlessing');
    }

    // ... and what the hell, throw in a great strides just before it
    if (tryAction('greatStrides')) {
        unshiftAction(sequence, 'greatStrides');
    }

    subSeq2 = [];

    // Use up any remaining durability and cp with quality / durability improving actions
    while (cp > 0 && dur > 0) {
        if (tryAction(preferredAction) && dur > 10) {
            pushAction(subSeq2, preferredAction);
        }
        else if (dur < 20) {
            if (tryAction('manipulation')) {
                unshiftAction(subSeq2, 'manipulation');
                dur += 30;
            }
            else if (tryAction('mastersMend')) {
                pushAction(subSeq2, 'mastersMend');
                dur += 30;
            }
            else {
                break;
            }
        }
        else {
            break;
        }
    }

    sequence = subSeq2.concat(sequence);
    sequence = subSeq1.concat(sequence);

    // Pray
    return sequence;
}


// Helper Functions
//=================

function _typeof(x) {
    if (Array.isArray(x)) {
        return 'array';
    }
    else {
        return typeof x;
    }
}

function clone(x) {
    var seen = {};
    function _clone(x) {
        if (x === null) {
            return null;
        }
        for (var s in seen) {
            if (s === x) {
                return seen[s];
            }
        }
        switch(_typeof(x)) {
            case 'object':
                var newObject = Object.create(Object.getPrototypeOf(x));
                seen[x] = newObject;
                for (var p in x) {
                    newObject[p] = _clone(x[p]);
                }
                return newObject;
            case 'array':
                var newArray = [];
                seen[x] = newArray;
                for (var pp in x) {
                    newArray[pp] = _clone(x[pp]);
                }
                return newArray;
            case 'number':
                return x;
            case 'string':
                return x;
            case 'boolean':
                return x;
            default:
                return x;
        }
    }
    return _clone(x);
}

var LevelTable = {
    51: 120, // 120
    52: 125, // 125
    53: 130, // 130
    54: 133, // 133
    55: 136, // 136
    56: 139, // 139
    57: 142, // 142
    58: 145, // 145
    59: 148, // 148
    60: 150, // 150
    61: 260,
    62: 265,
    63: 270,
    64: 273,
    65: 276,
    66: 279,
    67: 282,
    68: 285,
    69: 288,
    70: 290,
    71: 390,
    72: 395,
    73: 400,
    74: 403,
    75: 406,
    76: 409,
    77: 412,
    78: 415,
    79: 418,
    80: 420 
};

var ProgressPenaltyTable = {
    180: -0.02,
    210: -0.035,
    220: -0.035,
    250: -0.04,
    320: -0.02,
    350: -0.035,
};

var QualityPenaltyTable = {
    0: -0.02,
    90: -0.03,
    160: -0.05,
    180: -0.06,
    200: -0.07,
    245: -0.08,
    300: -0.09,
    310: -0.10,
    340: -0.11,
};

function getLevelDifferenceFactor(kind, levelDiff) {
    if (levelDiff < -30) levelDiff = -30;
    else if (levelDiff > 49) levelDiff = 49;

    return cld[kind][levelDiff] / 100;
}

// Test objects
//cls, level, craftsmanship, control, craftPoints, actions
/*
var myWeaverActions = [basicSynth];
var myWeaver = new Crafter('Weaver', 20, 119, 117, 243, false, myWeaverActions);
var initiatesSlops = new Recipe(20,74,70,0,1053);
var mySynth = new Synth(myWeaver, initiatesSlops, maxTrickUses=1, useConditions=true);
var actionSequence = [innerQuiet, steadyHand, wasteNot, basicSynth, hastyTouch, hastyTouch, hastyTouch, steadyHand, hastyTouch, tricksOfTheTrade, standardTouch, standardTouch, standardTouch, tricksOfTheTrade, rumination, mastersMend, hastyTouch, basicSynth, basicTouch, basicSynth];

simSynth(actionSequence, mySynth, false, true);
MonteCarloSynth(actionSequence, mySynth, false, true);
MonteCarloSim(actionSequence, mySynth, 500);
evalSeq(actionSequence, mySynth);
*/
