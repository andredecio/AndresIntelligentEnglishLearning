INSERT INTO Students (
    StudentFname,
    StudentLname,
    StudentShortName,
    CompanyID,
    ClassID,
    Level,
    Comments,
    Sex,
    Recommendation,
    ClassPeriod,
    DepartmentSection,
    HonouraryMention,
    SpecialMentionID,
    Term,
    Photo,
    StudentNumber,
    DateOfBirth,
    ListeningValue,
    PronunciationValue,
    ParticipationValue,
    GrammarValue,
    EffortValue,
    ConfidenceValue,
    ComprehensionValue,
    FluencyValue,
    PotentialValue,
    ResponseToMethodValue,
    ConcentrationValue,
    ContributionToClassValue,
    RecommendationValue,
    SpecialMentionIDValue
)
VALUES (
    'TestStudentFname',           -- StudentFname
    'TestStudentLname',            -- StudentLname
    'TShortname',             -- StudentShortName
    1,              -- CompanyID
    1,              -- ClassID
    1,                -- Level
    'Good student',   -- Comments
    'Male',           -- Sex
    1,               -- Recommendation
    'Period 1',       -- ClassPeriod
    'DepartSect',        -- DepartmentSection
    1,                -- HonouraryMention (1 for True, 0 for False)
    1,              -- SpecialMentionID
    1,                -- Term
    'Photo1',       -- Photo
    1,              -- StudentNumber
    '2005-03-15',     -- DateOfBirth (YYYY-MM-DD)
    0,               -- ListeningValue
    0,               -- PronunciationValue
    0,               -- ParticipationValue
    0,               -- GrammarValue
    50,               -- EffortValue
    50,               -- ConfidenceValue
    50,               -- ComprehensionValue
    50,               -- FluencyValue
    50,               -- PotentialValue
    50,               -- ResponseToMethodValue
    50,               -- ConcentrationValue
    50,               -- ContributionToClassValue
    1,               -- RecommendationValue
    1               -- SpecialMentionIDValue
);
