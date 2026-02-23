import analyzerClasses from './analyzers/index.js';

class ExperimentalAnalyzerRegistry {
    constructor() {
        this.analyzers = new Map();
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        for (const AnalyzerClass of analyzerClasses) {
            try {
                if (AnalyzerClass && AnalyzerClass.id) {
                    this.register(AnalyzerClass.id, {
                        name: AnalyzerClass.name,
                        description: AnalyzerClass.description,
                        inputType: AnalyzerClass.inputType,
                        outputColumns: AnalyzerClass.outputColumns,
                        concurrency: AnalyzerClass.concurrency, // Optional hint
                        processor: async (input) => {
                            const instance = new AnalyzerClass(input.config);
                            return instance.analyze(input);
                        }
                    });
                    console.log(`Registered analyzer: ${AnalyzerClass.id}`);
                }
            } catch (err) {
                console.error(`Failed to load analyzer ${AnalyzerClass?.id || AnalyzerClass?.name || 'unknown'}:`, err);
            }
        }
        this.initialized = true;
    }

    register(id, config) {
        this.analyzers.set(id, { id, ...config });
    }

    async get(id) {
        if (!this.initialized) await this.initialize();
        return this.analyzers.get(id);
    }

    async getAll() {
        if (!this.initialized) await this.initialize();
        return Array.from(this.analyzers.values());
    }

    async getProcessor(analyzerId) {
        const analyzer = await this.get(analyzerId);
        return analyzer?.processor;
    }
}

export default new ExperimentalAnalyzerRegistry();
