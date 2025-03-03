import { Type } from 'class-transformer';
import { ValidateNested, IsEmail, IsString, IsNotEmpty, Matches, MinLength, IsOptional, IsInt, Min, Max, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, IsNotIn } from 'class-validator';

// Custom validation constraint
@ValidatorConstraint({ async: false })
class IsGreaterThanConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const relatedField = args.object[args.constraints[0]];
    return value > relatedField;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be greater than ${args.constraints[0]}`;
  }
}

// Custom decorator using the constraint
function IsGreaterThan(property: string) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: `${propertyName} must be greater than ${property}`,
      },
      constraints: [property],
      validator: IsGreaterThanConstraint,
    });
  };
}

class UpdateTwitterConfigDtoSecrets {
  @IsString()
  @IsNotEmpty()
  // https://help.x.com/en/managing-your-account/x-username-rules
  @Matches(/^[A-Za-z0-9_]{4,15}$/, {
    message: 'Username must be 4 to 15 characters long and can only contain letters, numbers, and underscores',
  })
  TWITTER_USERNAME: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @IsNotEmpty()
  TWITTER_PASSWORD: string;

  @IsEmail()
  @IsNotEmpty()
  TWITTER_EMAIL: string;

  @IsString()
  @IsOptional()
  TWITTER_2FA_SECRET?: string;

  @IsString()
  @IsOptional()
  POST_IMMEDIATELY?: string = 'false';

  @IsString()
  @IsOptional()
  // if true, stop the twitter client
  TWITTER_LOGIN_SUSPEND?: string = 'false';

  @IsString()
  // https://stackoverflow.com/questions/61868770/tegram-bot-api-token-format
  @Matches(/^[0-9]{8,10}:[a-zA-Z0-9_-]{35}$/, {
    message: 'Telegram bot token must be in the format of 123456789:ABCdefghIJKlmnopQRStuvWxyZ',
  })
  @IsOptional()
  TELEGRAM_BOT_TOKEN?: string;

  @IsInt()
  @Min(4)
  @IsOptional()
  // in minutes
  POST_INTERVAL_MIN?: number

  @IsInt()
  @IsGreaterThan('POST_INTERVAL_MIN')
  @IsOptional()
  // in minutes
  POST_INTERVAL_MAX?: number

  @IsInt()
  @Max(200)
  @IsOptional()
  MAX_LENGTH?: number
}

class UpdateTwitterConfigDtoSettings {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => UpdateTwitterConfigDtoSecrets)
  secrets: UpdateTwitterConfigDtoSecrets
}

class UpdateTwitterConfigDtoTemplates {
  @IsNotEmpty()
  twitterPostTemplate: string;
}

class UpdateTwitterConfigDtoCharacterConfig {
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => UpdateTwitterConfigDtoSettings)
  settings: UpdateTwitterConfigDtoSettings;

  @IsNotEmpty()
  postExamples: string[];

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => UpdateTwitterConfigDtoTemplates)
  templates: UpdateTwitterConfigDtoTemplates
}

export class UpdateTwitterConfigDto {
  @IsNotIn([undefined, null])
  testContent: string;

  @IsNotEmpty()
  @ValidateNested()
  @Type(() => UpdateTwitterConfigDtoCharacterConfig)
  characterConfig: UpdateTwitterConfigDtoCharacterConfig;
}
